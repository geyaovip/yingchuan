import { HttpException, Injectable } from "@nestjs/common";
import {
  AgentActionStatus,
  AgentRunStatus,
  AuthAudience,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import type { AnalysisApplicationService } from "@yingchuan/analysis";
import { v7 as uuidv7 } from "uuid";

import type { AuthenticatedSession } from "../auth/auth.types.js";
import {
  AGENT_FORMULATION_TIMEOUT_MS,
  assertOutputTokenBudget,
  OPENCLAW_VERSION,
  type OpenClawRuntime,
  type RuntimeEvidence,
} from "./openclaw-runtime.js";
import { skillRegistry, validateRegistry } from "./skill-registry.js";

interface AgentInput {
  readonly action?: {
    readonly args: unknown;
    readonly idempotencyKey?: string;
    readonly skillName: string;
  };
  readonly projectId?: string;
  readonly question: string;
  readonly tokenBudget?: number;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly database: PrismaClient,
    private readonly analysis: AnalysisApplicationService,
    private readonly runtime: OpenClawRuntime,
  ) {
    validateRegistry();
  }

  async run(auth: AuthenticatedSession, input: AgentInput) {
    await this.requireAdmin(auth);
    const tokenBudget = Math.min(
      8_000,
      Math.max(200, input.tokenBudget ?? 2_000),
    );
    const run = await this.database.agentRun.create({
      data: {
        allowedSkills: [...skillRegistry.keys()],
        citations: [],
        contextSnapshot: { projectId: input.projectId ?? null },
        costBudgetMicros: 100_000n,
        id: uuidv7(),
        projectId: input.projectId,
        question: input.question.trim(),
        runtimeVersion: OPENCLAW_VERSION,
        startedAt: new Date(),
        status: AgentRunStatus.running,
        tokenBudget,
        userId: auth.user.id,
      },
    });
    try {
      const evidence: RuntimeEvidence[] = [];
      for (const skillName of this.routeReadSkills(
        input.question,
        input.projectId,
      ))
        evidence.push(
          await this.executeSkill(
            run.id,
            skillName,
            skillName === "project.report.read"
              ? { projectId: input.projectId }
              : {},
            auth,
          ),
        );
      if (input.action)
        evidence.push(
          await this.executeSkill(
            run.id,
            input.action.skillName,
            input.action.args,
            auth,
            input.action.idempotencyKey,
          ),
        );
      const result = await this.runtime.formulate(
        input.question,
        evidence,
        AGENT_FORMULATION_TIMEOUT_MS,
        tokenBudget,
      );
      assertOutputTokenBudget(result, tokenBudget);
      return this.serialize(
        await this.database.agentRun.update({
          data: {
            answer: result.answer,
            citations: evidence.map(({ citation, skill }) => ({
              citation,
              skill,
            })),
            completedAt: new Date(),
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            status: AgentRunStatus.succeeded,
          },
          include: { actions: true },
          where: { id: run.id },
        }),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "AGENT_FAILED";
      await this.database.agentRun.update({
        data: {
          completedAt: new Date(),
          errorCode: this.safeCode(code),
          status:
            code === "AGENT_BUDGET_EXCEEDED"
              ? AgentRunStatus.budget_exceeded
              : AgentRunStatus.failed,
        },
        where: { id: run.id },
      });
      throw new HttpException(
        {
          error: {
            code: this.safeCode(code),
            message: "运营助手暂时无法完成请求。",
          },
        },
        code === "SKILL_NOT_ALLOWED" ? 403 : 503,
      );
    }
  }

  async list(auth: AuthenticatedSession) {
    await this.requireAdmin(auth);
    return this.serialize(
      await this.database.agentRun.findMany({
        include: { actions: true },
        orderBy: { createdAt: "desc" },
        take: 50,
        where: { userId: auth.user.id },
      }),
    );
  }

  private routeReadSkills(question: string, projectId?: string): string[] {
    const routed = new Set<string>();
    if (/(?:概览|首页|平台|dashboard)/iu.test(question))
      routed.add("dashboard.read");
    if (/(?:模型|model)/iu.test(question)) routed.add("model.health.read");
    if (/(?:队列|死信|queue)/iu.test(question)) routed.add("queue.health.read");
    if (projectId && /(?:报告|分数|report)/iu.test(question))
      routed.add("project.report.read");
    return [...routed];
  }

  private async executeSkill(
    runId: string,
    name: string,
    rawArgs: unknown,
    auth: AuthenticatedSession,
    idempotencyKey?: string,
  ): Promise<RuntimeEvidence> {
    const definition = skillRegistry.get(name);
    if (!definition) throw new Error("SKILL_NOT_ALLOWED");
    if (definition.write && !idempotencyKey)
      throw new Error("SKILL_IDEMPOTENCY_REQUIRED");
    const args = definition.inputSchema.parse(rawArgs);
    const action = await this.database.agentAction.create({
      data: {
        agentRunId: runId,
        id: uuidv7(),
        idempotencyKey,
        inputSnapshot: args as object,
        riskLevel: definition.risk,
        skillName: name,
        skillVersion: definition.version,
        status: AgentActionStatus.proposed,
      },
    });
    try {
      const output = await this.invoke(
        name,
        args as Record<string, unknown>,
        auth,
        runId,
      );
      await this.database.agentAction.update({
        data: {
          completedAt: new Date(),
          outputSnapshot: output as object,
          status: AgentActionStatus.executed,
        },
        where: { id: action.id },
      });
      await this.audit(auth, action.id, name, definition.risk);
      return {
        citation: `skill://${name}/${action.id}`,
        data: output,
        skill: name,
      };
    } catch (error) {
      await this.database.agentAction.update({
        data: {
          completedAt: new Date(),
          errorCode: this.safeCode(
            error instanceof Error ? error.message : "SKILL_FAILED",
          ),
          status: AgentActionStatus.failed,
        },
        where: { id: action.id },
      });
      throw error;
    }
  }

  private async invoke(
    name: string,
    args: Record<string, unknown>,
    auth: AuthenticatedSession,
    runId: string,
  ): Promise<unknown> {
    if (name === "dashboard.read")
      return {
        generatedAt: new Date(),
        projects: await this.database.project.count(),
        runningJobs: await this.database.analysisJob.count({
          where: { status: "running" },
        }),
        users: await this.database.user.count(),
      };
    if (name === "task.health.read")
      return this.database.analysisJob.findUnique({
        include: {
          runs: {
            select: {
              errorCode: true,
              id: true,
              retryable: true,
              status: true,
            },
          },
        },
        where: { id: String(args.jobId) },
      });
    if (name === "model.health.read")
      return {
        failed24h: await this.database.modelCallLog.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 86_400_000) },
            status: "failed",
          },
        }),
        providers: await this.database.modelProvider.findMany({
          select: { code: true, status: true },
        }),
      };
    if (name === "queue.health.read")
      return {
        deadLetters: await this.database.outboxEvent.count({
          where: { status: "dead_letter" },
        }),
        pending: await this.database.outboxEvent.count({
          where: { status: "pending" },
        }),
        sampledAt: new Date(),
      };
    if (name === "project.report.read")
      return this.database.reportVersion.findFirst({
        orderBy: { versionNumber: "desc" },
        select: {
          contentSnapshot: true,
          generatedAt: true,
          id: true,
          limitationSummary: true,
          status: true,
        },
        where: { report: { projectId: String(args.projectId) } },
      });
    if (name === "retry_task")
      return this.analysis.retryAsAdmin(String(args.jobId), {
        email: auth.user.displayEmail,
        userId: auth.user.id,
      });
    if (name === "admin.todo.create")
      return this.database.adminTodo.create({
        data: {
          agentRunId: runId,
          createdById: auth.user.id,
          description:
            typeof args.description === "string" ? args.description : undefined,
          id: uuidv7(),
          title: String(args.title),
        },
      });
    throw new Error("SKILL_NOT_ALLOWED");
  }

  private async requireAdmin(auth: AuthenticatedSession) {
    if (
      auth.session.audience !== AuthAudience.admin ||
      !(await this.database.platformRoleAssignment.findFirst({
        where: { role: { code: "super_admin" }, userId: auth.user.id },
      }))
    )
      throw new HttpException(
        { error: { code: "FORBIDDEN", message: "没有执行此操作的权限。" } },
        403,
      );
  }
  private async audit(
    auth: AuthenticatedSession,
    objectId: string,
    action: string,
    riskLevel: string,
  ) {
    const context = getRequestContext();
    await this.database.auditLog.create({
      data: {
        action: `agent.skill.${action}`,
        actorEmailMask: "admin***",
        actorId: auth.user.id,
        actorType: "agent_user",
        id: uuidv7(),
        objectId,
        objectType: "AgentAction",
        outcome: "success",
        requestId: context?.requestId ?? uuidv7(),
        riskLevel,
        traceId: context?.traceId ?? "00000000000000000000000000000000",
      },
    });
  }
  private safeCode(code: string) {
    return [
      "AGENT_BUDGET_EXCEEDED",
      "OPENCLAW_UNAVAILABLE",
      "OPENCLAW_RESPONSE_INVALID",
      "SKILL_NOT_ALLOWED",
      "SKILL_IDEMPOTENCY_REQUIRED",
      "ANALYSIS_NO_RETRYABLE_RUNS",
    ].includes(code)
      ? code
      : "AGENT_FAILED";
  }
  private serialize(value: unknown) {
    return JSON.parse(
      JSON.stringify(value, (_, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as unknown;
  }
}
