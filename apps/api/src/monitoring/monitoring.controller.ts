import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  AnalysisServiceError,
  InsightsApplicationService,
  MonitoringApplicationService,
} from "@yingchuan/analysis";
import { ModelGatewayServiceError } from "@yingchuan/model-gateway";
import type { Request } from "express";
import { z, ZodError } from "zod";
import { AuthService } from "../auth/auth.service.js";
import { sessionToken } from "../auth/session-cookie.js";
import {
  activeSchema,
  filtersSchema,
  retestSchema,
  scheduleSchema,
  scheduleUpdateSchema,
  selectionSchema,
  taskSchema,
  taskUpdateSchema,
} from "./monitoring.schemas.js";

@Controller("projects/:projectId")
export class MonitoringController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MonitoringApplicationService)
    private readonly monitoring: MonitoringApplicationService,
    @Inject(InsightsApplicationService)
    private readonly insights: InsightsApplicationService,
  ) {}

  @Get("insights")
  async getInsights(
    @Param("projectId") id: string,
    @Query() query: unknown,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request);
    return this.perform(() =>
      this.insights.get(
        this.id(id),
        actor.userId,
        this.parse(() => filtersSchema.parse(query)),
      ),
    );
  }
  @Get("monitoring")
  async getSettings(@Param("projectId") id: string, @Req() request: Request) {
    const actor = await this.actor(request);
    return this.perform(() =>
      this.monitoring.settings(this.id(id), actor.userId),
    );
  }
  @Post("monitoring/estimate")
  async estimate(
    @Param("projectId") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request, true);
    return this.perform(() =>
      this.monitoring.estimate(
        this.id(id),
        actor.userId,
        this.parse(() => selectionSchema.parse(body)),
      ),
    );
  }
  @Post("monitoring/schedules")
  async createSchedule(
    @Param("projectId") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request, true);
    return this.perform(() =>
      this.monitoring.createSchedule(
        this.id(id),
        actor,
        this.parse(() => scheduleSchema.parse(body)),
        key ?? "",
      ),
    );
  }
  @Patch("monitoring/schedules/:scheduleId")
  async setSchedule(
    @Param("projectId") id: string,
    @Param("scheduleId") scheduleId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request, true);
    if (typeof body === "object" && body !== null && "name" in body)
      return this.perform(() =>
        this.monitoring.updateSchedule(
          this.id(id),
          this.id(scheduleId),
          actor,
          this.parse(() => scheduleUpdateSchema.parse(body)),
        ),
      );
    return this.perform(() =>
      this.monitoring.setScheduleActive(
        this.id(id),
        this.id(scheduleId),
        actor,
        this.parse(() => activeSchema.parse(body)),
      ),
    );
  }
  @Get("optimization-tasks")
  async tasks(@Param("projectId") id: string, @Req() request: Request) {
    const actor = await this.actor(request);
    return this.perform(() => this.monitoring.tasks(this.id(id), actor.userId));
  }
  @Post("optimization-tasks")
  async createTask(
    @Param("projectId") id: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request, true);
    return this.perform(() =>
      this.monitoring.createTask(
        this.id(id),
        actor,
        this.parse(() => taskSchema.parse(body)),
      ),
    );
  }
  @Patch("optimization-tasks/:taskId")
  async updateTask(
    @Param("projectId") id: string,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request, true);
    return this.perform(() =>
      this.monitoring.updateTask(
        this.id(id),
        this.id(taskId),
        actor,
        this.parse(() => taskUpdateSchema.parse(body)),
      ),
    );
  }
  @Post("optimization-tasks/:taskId/retests")
  async retest(
    @Param("projectId") id: string,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: Request,
  ) {
    const actor = await this.actor(request, true);
    return this.perform(() =>
      this.monitoring.retest(
        this.id(id),
        this.id(taskId),
        actor,
        key ?? "",
        this.parse(() => retestSchema.parse(body)).maxCostMicros,
      ),
    );
  }
  private async actor(request: Request, write = false) {
    const session = await this.auth.getSession(sessionToken(request, "user"));
    if (write)
      this.auth.assertCsrf(
        session,
        request.header("x-csrf-token"),
        request.header("origin") ?? "",
      );
    else this.auth.assertSessionOrigin(session, request.header("origin"));
    return { userId: session.user.id, email: session.user.displayEmail };
  }
  private id(value: string) {
    return this.parse(() => z.uuid().parse(value));
  }
  private parse<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ZodError)
        throw new HttpException(
          { error: { code: "VALIDATION_FAILED", message: "请检查填写内容。" } },
          400,
        );
      throw error;
    }
  }
  private async perform<T>(operation: () => Promise<T>) {
    try {
      return { data: await operation() };
    } catch (error) {
      if (
        error instanceof AnalysisServiceError ||
        error instanceof ModelGatewayServiceError
      ) {
        const messages: Record<string, string> = {
          RESOURCE_NOT_FOUND: "项目不存在或无操作权限。",
          MONITORING_LIMIT_REACHED: "已达到 20 个监测计划上限。",
          MONITORING_PRICE_UNAVAILABLE:
            "模型价格尚未配置，请联系管理员补齐后重试。",
          MONITORING_BUDGET_EXCEEDED:
            "预计费用超过单次上限，请调整配置或上限。",
          MONITORING_SELECTION_UNAVAILABLE:
            "部分问题或模型已停用，请重新选择。",
          BASELINE_UNAVAILABLE: "基线分析不可用，请选择已完成的分析。",
          ANALYSIS_HAS_NO_ELIGIBLE_RUNS: "所选组合没有可执行的分析。",
          ANALYSIS_QUOTA_INSUFFICIENT: "工作区可用额度不足。",
          VERSION_CONFLICT: "内容已更新，请刷新后重试。",
          ASSIGNEE_UNAVAILABLE: "负责人已不在工作区，请重新选择。",
          IDEMPOTENCY_KEY_REQUIRED: "请求标识无效，请重试。",
          IDEMPOTENCY_CONFLICT: "请求内容已变更，请重新核算后提交。",
          INSIGHTS_RANGE_TOO_LARGE: "数据量超过查询上限，请缩短统计时间。",
          PROJECT_NOT_READY: "项目当前无法运行分析，请检查项目状态。",
        };
        throw new HttpException(
          {
            error: {
              code: error.code,
              message: messages[error.code] ?? "操作未完成，请重试。",
            },
          },
          error.status,
        );
      }
      throw error;
    }
  }
}
