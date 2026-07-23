import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  AnalysisApplicationService,
  AnalysisServiceError,
} from "@yingchuan/analysis";
import type { Request } from "express";
import { ZodError } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import type { AuthenticatedSession } from "../auth/auth.types.js";
import { ANALYSIS_SERVICE } from "./analysis.constants.js";
import { cancellationSchema } from "./analysis.schemas.js";

@Controller()
export class AnalysisController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ANALYSIS_SERVICE)
    private readonly analysis: AnalysisApplicationService,
  ) {}

  @Post("projects/:projectId/analysis-jobs")
  async create(
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.analysis.create(projectId, this.actor(auth), key ?? ""),
      ),
    };
  }

  @Get("projects/:projectId/analysis-jobs")
  async list(@Param("projectId") projectId: string, @Req() request: Request) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() =>
        this.analysis.list(projectId, auth.user.id),
      ),
    };
  }

  @Get("analysis-jobs/:jobId")
  async get(@Param("jobId") jobId: string, @Req() request: Request) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() => this.analysis.get(jobId, auth.user.id)),
    };
  }

  @Get("analysis-jobs/:jobId/model-runs")
  async runs(@Param("jobId") jobId: string, @Req() request: Request) {
    const auth = await this.readAuth(request);
    const job = (await this.perform(() =>
      this.analysis.get(jobId, auth.user.id),
    )) as { runs?: unknown[] };
    return { data: job.runs ?? [] };
  }

  @Post("analysis-jobs/:jobId/cancellation")
  async cancel(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => cancellationSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.analysis.cancel(jobId, input.reason, this.actor(auth)),
      ),
    };
  }

  @Post("analysis-jobs/:jobId/retries")
  async retry(
    @Param("jobId") jobId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.analysis.retry(jobId, this.actor(auth)),
      ),
    };
  }

  private async readAuth(request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }

  private async writeAuth(request: Request, csrf: string | undefined) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return auth;
  }

  private actor(auth: AuthenticatedSession) {
    return { email: auth.user.displayEmail, userId: auth.user.id };
  }

  private sessionToken(request: Request): string | undefined {
    return readSessionToken(request, "user");
  }

  private parse<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ZodError) throw this.error("VALIDATION_FAILED", 400);
      throw error;
    }
  }

  private async perform<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AnalysisServiceError)
        throw this.error(error.code, error.status);
      throw error;
    }
  }

  private error(code: string, status: number) {
    const messages: Record<string, string> = {
      ANALYSIS_HAS_NO_ELIGIBLE_RUNS: "当前没有可执行的 Prompt 与模型组合。",
      ANALYSIS_NO_RETRYABLE_RUNS: "没有可重试的失败运行。",
      ANALYSIS_NOT_CANCELLABLE: "当前任务已不能取消。",
      ANALYSIS_QUOTA_INSUFFICIENT: "当前额度不足以运行本次分析。",
      IDEMPOTENCY_KEY_REQUIRED: "请提供幂等键。",
    };
    return new HttpException(
      { error: { code, message: messages[code] ?? "无法完成分析任务操作。" } },
      status,
    );
  }
}
