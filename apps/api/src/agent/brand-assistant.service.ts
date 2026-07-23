import { HttpException, Injectable } from "@nestjs/common";
import {
  AgentActionStatus,
  AgentRunStatus,
  AuthAudience,
  MembershipStatus,
  ReportVersionStatus,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import type { AuthenticatedSession } from "../auth/auth.types.js";
import {
  AGENT_FORMULATION_TIMEOUT_MS,
  assertOutputTokenBudget,
  OPENCLAW_VERSION,
  type OpenClawRuntime,
  type RuntimeEvidence,
} from "./openclaw-runtime.js";
import {
  brandAssistantSkillRegistry,
  validateRegistry,
} from "./skill-registry.js";

interface BrandAssistantInput {
  readonly question: string;
  readonly tokenBudget?: number;
}

interface Citation {
  readonly citation: string;
  readonly label: string;
  readonly observedAt: string;
  readonly skill: string;
}

interface EvidenceRecord extends RuntimeEvidence {
  readonly label: string;
  readonly observedAt: string;
}

@Injectable()
export class BrandAssistantService {
  constructor(
    private readonly database: PrismaClient,
    private readonly runtime: OpenClawRuntime,
  ) {
    validateRegistry();
  }

  async run(
    auth: AuthenticatedSession,
    workspaceId: string,
    projectId: string,
    input: BrandAssistantInput,
  ) {
    const project = await this.requireProject(auth, workspaceId, projectId);
    const tokenBudget = Math.min(
      4_000,
      Math.max(200, input.tokenBudget ?? 1_500),
    );
    const startedAt = new Date();
    const run = await this.database.agentRun.create({
      data: {
        allowedSkills: [...brandAssistantSkillRegistry.keys()],
        citations: [],
        contextSnapshot: {
          assistant: "brand",
          projectName: project.name,
          timezone: project.timezone,
        },
        costBudgetMicros: 50_000n,
        id: uuidv7(),
        projectId,
        question: input.question.trim(),
        runtimeVersion: OPENCLAW_VERSION,
        startedAt,
        status: AgentRunStatus.running,
        tokenBudget,
        userId: auth.user.id,
        workspaceId,
      },
    });

    try {
      const evidence = await this.collectEvidence(
        run.id,
        projectId,
        input.question,
        auth,
        workspaceId,
      );
      const reportEvidence = evidence.find(
        (item) => item.skill === "brand.report.read",
      );
      const uncertainty = this.uncertainty(reportEvidence?.data);
      const sourceGeneratedAt = this.reportGeneratedAt(reportEvidence?.data);
      const citations: Citation[] = evidence.map((item) => ({
        citation: item.citation,
        label: item.label,
        observedAt: item.observedAt,
        skill: item.skill,
      }));
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
            citations: citations as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
            contextSnapshot: {
              assistant: "brand",
              projectName: project.name,
              sampledAt: startedAt.toISOString(),
              sourceGeneratedAt,
              timezone: project.timezone,
              uncertainty,
            },
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            status: AgentRunStatus.succeeded,
          },
          include: { actions: { orderBy: { createdAt: "asc" } } },
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
      throw this.error(this.safeCode(code), 503);
    }
  }

  async list(
    auth: AuthenticatedSession,
    workspaceId: string,
    projectId: string,
  ) {
    await this.requireProject(auth, workspaceId, projectId);
    return this.serialize(
      await this.database.agentRun.findMany({
        include: { actions: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 30,
        where: { projectId, userId: auth.user.id, workspaceId },
      }),
    );
  }

  private async collectEvidence(
    runId: string,
    projectId: string,
    question: string,
    auth: AuthenticatedSession,
    workspaceId: string,
  ): Promise<EvidenceRecord[]> {
    const skillNames = ["brand.project.read", "brand.report.read"];
    if (/(?:竞品|竞争|对手|competitor)/iu.test(question))
      skillNames.push("brand.competitors.read");
    if (/(?:问题|prompt|提问|分析项)/iu.test(question))
      skillNames.push("brand.prompts.read");
    return Promise.all(
      skillNames.map((name) =>
        this.executeSkill(runId, name, { projectId }, auth, workspaceId),
      ),
    );
  }

  private async executeSkill(
    runId: string,
    name: string,
    rawArgs: unknown,
    auth: AuthenticatedSession,
    workspaceId: string,
  ): Promise<EvidenceRecord> {
    const definition = brandAssistantSkillRegistry.get(name);
    if (!definition || definition.write) throw new Error("SKILL_NOT_ALLOWED");
    const args = definition.inputSchema.parse(rawArgs) as {
      projectId: string;
    };
    const action = await this.database.agentAction.create({
      data: {
        agentRunId: runId,
        id: uuidv7(),
        inputSnapshot: args,
        riskLevel: definition.risk,
        skillName: name,
        skillVersion: definition.version,
        status: AgentActionStatus.proposed,
      },
    });
    try {
      const observedAt = new Date().toISOString();
      const data = await this.invoke(name, args.projectId, observedAt);
      await this.database.agentAction.update({
        data: {
          completedAt: new Date(),
          outputSnapshot: data,
          status: AgentActionStatus.executed,
        },
        where: { id: action.id },
      });
      await this.audit(auth, workspaceId, action.id, name, "success");
      return {
        citation: `skill://${name}/${action.id}`,
        data,
        label: definition.description,
        observedAt,
        skill: name,
      };
    } catch (error) {
      const errorCode = this.safeCode(
        error instanceof Error ? error.message : "SKILL_FAILED",
      );
      await this.database.agentAction.update({
        data: {
          completedAt: new Date(),
          errorCode,
          status: AgentActionStatus.failed,
        },
        where: { id: action.id },
      });
      await this.audit(
        auth,
        workspaceId,
        action.id,
        name,
        "failure",
        errorCode,
      );
      throw error;
    }
  }

  private async invoke(name: string, projectId: string, observedAt: string) {
    if (name === "brand.project.read") {
      const project = await this.database.project.findUniqueOrThrow({
        select: {
          brandEntity: {
            select: {
              canonicalName: true,
              country: true,
              officialWebsite: true,
              primaryLanguage: true,
            },
          },
          defaultCountry: true,
          defaultLanguage: true,
          name: true,
          status: true,
          timezone: true,
          updatedAt: true,
        },
        where: { id: projectId },
      });
      return { observedAt, project };
    }
    if (name === "brand.report.read") {
      const report = await this.database.reportVersion.findFirst({
        orderBy: { versionNumber: "desc" },
        select: {
          contentSnapshot: true,
          generatedAt: true,
          id: true,
          limitationSummary: true,
          recommendations: {
            orderBy: [{ priority: "asc" }, { sortOrder: "asc" }],
            select: {
              category: true,
              description: true,
              effort: true,
              impact: true,
              priority: true,
              title: true,
            },
            take: 10,
          },
          status: true,
          title: true,
          versionNumber: true,
        },
        where: {
          report: { projectId },
          status: {
            in: [ReportVersionStatus.ready, ReportVersionStatus.published],
          },
        },
      });
      return { observedAt, report };
    }
    if (name === "brand.competitors.read")
      return {
        competitors: await this.database.competitor.findMany({
          orderBy: [{ evidenceCount: "desc" }, { canonicalName: "asc" }],
          select: {
            canonicalName: true,
            evidenceCount: true,
            status: true,
            updatedAt: true,
          },
          take: 20,
          where: { projectId },
        }),
        observedAt,
      };
    if (name === "brand.prompts.read")
      return {
        observedAt,
        prompts: await this.database.prompt.findMany({
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          select: {
            category: true,
            language: true,
            scope: true,
            text: true,
            updatedAt: true,
          },
          take: 30,
          where: { deletedAt: null, enabled: true, projectId },
        }),
      };
    throw new Error("SKILL_NOT_ALLOWED");
  }

  private async requireProject(
    auth: AuthenticatedSession,
    workspaceId: string,
    projectId: string,
  ) {
    if (auth.session.audience !== AuthAudience.user)
      throw this.error("FORBIDDEN", 403);
    const project = await this.database.project.findFirst({
      select: { id: true, name: true, timezone: true, workspaceId: true },
      where: {
        id: projectId,
        workspaceId,
        workspace: {
          memberships: {
            some: {
              status: MembershipStatus.active,
              userId: auth.user.id,
            },
          },
        },
      },
    });
    if (!project) throw this.error("RESOURCE_NOT_FOUND", 404);
    return project;
  }

  private uncertainty(data: unknown) {
    const report = this.record(this.record(data)?.report);
    if (!report)
      return {
        level: "high",
        message: "当前项目暂无可用报告，无法确定报告结论。",
      };
    const content = this.record(report.contentSnapshot);
    const failedRuns = Number(content?.failedRuns ?? 0);
    if (
      failedRuns > 0 ||
      (typeof report.limitationSummary === "string" &&
        report.limitationSummary.trim())
    )
      return {
        level: "medium",
        message: "最新报告包含失败样本或局限说明，结论需结合引用谨慎解读。",
      };
    return {
      level: "low",
      message: "回答基于当前项目的最新可用报告与已保存数据。",
    };
  }

  private reportGeneratedAt(data: unknown): string | null {
    const value = this.record(this.record(data)?.report)?.generatedAt;
    if (value instanceof Date) return value.toISOString();
    return typeof value === "string" ? value : null;
  }

  private record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private safeCode(code: string) {
    return [
      "AGENT_BUDGET_EXCEEDED",
      "OPENCLAW_RESPONSE_INVALID",
      "OPENCLAW_UNAVAILABLE",
      "SKILL_NOT_ALLOWED",
    ].includes(code)
      ? code
      : "AGENT_FAILED";
  }

  private async audit(
    auth: AuthenticatedSession,
    workspaceId: string,
    objectId: string,
    skillName: string,
    outcome: "success" | "failure",
    errorCode?: string,
  ) {
    const context = getRequestContext();
    await this.database.auditLog.create({
      data: {
        action: `agent.skill.${skillName}`,
        actorId: auth.user.id,
        actorType: "agent_user",
        errorCode,
        id: uuidv7(),
        objectId,
        objectType: "AgentAction",
        outcome,
        requestId: context?.requestId ?? uuidv7(),
        riskLevel: "read",
        sessionId: auth.session.id,
        traceId: context?.traceId ?? "0".repeat(32),
        workspaceId,
      },
    });
  }

  private error(code: string, status: number) {
    return new HttpException(
      {
        error: {
          code,
          message:
            code === "RESOURCE_NOT_FOUND"
              ? "项目不存在或当前工作区无权访问。"
              : code === "FORBIDDEN"
                ? "没有使用品牌管家的权限。"
                : "品牌管家暂时无法完成请求。",
        },
      },
      status,
    );
  }

  private serialize(value: unknown) {
    return JSON.parse(
      JSON.stringify(value, (_, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as unknown;
  }
}
