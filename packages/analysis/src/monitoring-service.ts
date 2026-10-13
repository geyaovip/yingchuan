import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@yingchuan/database";
import type {
  AnalysisSelection,
  ModelGatewayApplicationService,
} from "@yingchuan/model-gateway";
import { v7 as uuidv7 } from "uuid";
import { getRequestContext } from "@yingchuan/observability";
import {
  type AnalysisApplicationService,
  AnalysisServiceError,
  type AnalysisActor,
} from "./analysis-service.js";

export interface ScheduleInput {
  name: string;
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
  weekday: number;
  promptIds: string[];
  modelConfigIds: string[];
  maxCostMicros: string;
}
export interface OptimizationInput {
  title: string;
  description: string;
  baselineJobId: string;
  assigneeId?: string | null;
  evidenceUrl?: string | null;
  dueAt?: string | null;
}
export interface OptimizationUpdate {
  version: number;
  title: string;
  description: string;
  assigneeId?: string | null;
  evidenceUrl?: string | null;
  dueAt?: string | null;
  status: "open" | "in_progress" | "done";
}

/** Wall-clock scheduling also handles DST gaps and repeated hours. Stored instants are UTC. */
export function nextMonitoringAt(
  input: {
    frequency: "daily" | "weekly";
    hour: number;
    minute: number;
    weekday: number;
    timezone: string;
  },
  after: Date,
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: input.timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const start = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;
  for (let i = 0; i < 9 * 1440; i++) {
    const instant = new Date(start + i * 60_000);
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    if (
      Number(parts.hour) === input.hour &&
      Number(parts.minute) === input.minute &&
      (input.frequency === "daily" || parts.weekday === weekdays[input.weekday])
    )
      return instant;
  }
  throw new AnalysisServiceError("MONITORING_TIME_INVALID", 400);
}

export interface MonitoringSiteNotice {
  readonly userId: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly idempotencyKey: string;
}
export type MonitoringNoticeWriter = (
  transaction: Prisma.TransactionClient,
  input: MonitoringSiteNotice,
) => Promise<void>;

export class MonitoringApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly gateway: ModelGatewayApplicationService,
    private readonly analysis: AnalysisApplicationService,
    private readonly writeNotice: MonitoringNoticeWriter,
  ) {}

  private async project(projectId: string, userId: string, permission: string) {
    const project = await this.database.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          memberships: {
            some: {
              userId,
              status: "active",
              user: { status: "active" },
              role: {
                rolePermissions: { some: { permission: { code: permission } } },
              },
            },
          },
        },
      },
    });
    if (!project) throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    return project;
  }
  async settings(projectId: string, userId: string) {
    const project = await this.project(projectId, userId, "report.view");
    const [schedules, prompts, models, members, jobs, permission] =
      await Promise.all([
        this.database.monitoringSchedule.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          include: {
            executions: {
              orderBy: { dueAt: "desc" },
              take: 10,
              include: { analysisJob: { select: { status: true } } },
            },
          },
        }),
        this.database.prompt.findMany({
          where: { projectId, enabled: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, text: true, groupKey: true },
        }),
        this.database.modelConfig.findMany({
          where: { status: "enabled", provider: { status: "enabled" } },
          orderBy: { displayName: "asc" },
          select: {
            id: true,
            displayName: true,
            versions: {
              take: 1,
              orderBy: { versionNumber: "desc" },
              select: { nativeWebSearch: true },
            },
          },
        }),
        this.database.workspaceMembership.findMany({
          where: {
            workspaceId: project.workspaceId,
            status: "active",
            user: { status: "active" },
          },
          select: { user: { select: { id: true, displayEmail: true } } },
        }),
        this.database.analysisJob.findMany({
          where: {
            projectId,
            status: { in: ["completed", "partially_completed"] },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, createdAt: true, status: true, totalRuns: true },
        }),
        this.database.workspaceMembership.findFirst({
          where: { workspaceId: project.workspaceId, userId, status: "active" },
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        }),
      ]);
    return this.view({
      timezone: project.timezone,
      schedules,
      prompts,
      models: models.map((row) => ({
        id: row.id,
        name: row.displayName,
        nativeWebSearch: row.versions[0]?.nativeWebSearch ?? false,
      })),
      members: members.map((row) => row.user),
      jobs,
      permissions:
        permission?.role.rolePermissions.map((row) => row.permission.code) ??
        [],
    });
  }
  async estimate(
    projectId: string,
    userId: string,
    selection: AnalysisSelection,
  ) {
    await this.project(projectId, userId, "analysis.run");
    const estimate = await this.gateway.estimate(projectId, userId, selection);
    const models = await this.database.modelConfigVersion.findMany({
      where: {
        id: {
          in: estimate.items
            .filter((item) => item.status === "eligible")
            .map((item) => item.modelVersionId),
        },
      },
    });
    if (
      models.some(
        (version) =>
          version.inputPriceMicrosPerMillion === null ||
          version.outputPriceMicrosPerMillion === null,
      )
    )
      throw new AnalysisServiceError("MONITORING_PRICE_UNAVAILABLE", 409);
    return estimate;
  }
  async createSchedule(
    projectId: string,
    actor: AnalysisActor,
    input: ScheduleInput,
    key: string,
  ) {
    const project = await this.project(projectId, actor.userId, "analysis.run");
    if (!key || key.length > 120)
      throw new AnalysisServiceError("IDEMPOTENCY_KEY_REQUIRED", 400);
    const idempotencyKey = `schedule:${actor.userId}:${key}`;
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          ...input,
          projectId,
          promptIds: [...input.promptIds].sort(),
          modelConfigIds: [...input.modelConfigIds].sort(),
        }),
      )
      .digest("hex");
    const existing = await this.database.monitoringSchedule.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      if (
        existing.projectId !== projectId ||
        existing.requestHash !== requestHash
      )
        throw new AnalysisServiceError("IDEMPOTENCY_CONFLICT", 409);
      return this.view(existing);
    }
    if (
      (await this.database.monitoringSchedule.count({
        where: { projectId },
      })) >= 20
    )
      throw new AnalysisServiceError("MONITORING_LIMIT_REACHED", 409);
    const estimate = await this.estimate(projectId, actor.userId, input);
    if (!estimate.eligibleRunCount)
      throw new AnalysisServiceError("ANALYSIS_HAS_NO_ELIGIBLE_RUNS", 409);
    if (BigInt(estimate.estimatedCostMicros) > BigInt(input.maxCostMicros))
      throw new AnalysisServiceError("MONITORING_BUDGET_EXCEEDED", 409);
    const id = uuidv7();
    const nextRunAt = nextMonitoringAt(
      { ...input, timezone: project.timezone },
      new Date(),
    );
    try {
      const row = await this.database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
        const replay = await tx.monitoringSchedule.findUnique({
          where: { idempotencyKey },
        });
        if (replay) {
          if (
            replay.projectId !== projectId ||
            replay.requestHash !== requestHash
          )
            throw new AnalysisServiceError("IDEMPOTENCY_CONFLICT", 409);
          return replay;
        }
        if ((await tx.monitoringSchedule.count({ where: { projectId } })) >= 20)
          throw new AnalysisServiceError("MONITORING_LIMIT_REACHED", 409);
        const row = await tx.monitoringSchedule.create({
          data: {
            ...input,
            idempotencyKey,
            requestHash,
            id,
            projectId,
            createdById: actor.userId,
            timezone: project.timezone,
            nextRunAt,
            maxCostMicros: BigInt(input.maxCostMicros),
          },
        });
        await this.audit(
          tx,
          project.workspaceId,
          actor,
          "monitoring.create",
          "MonitoringSchedule",
          id,
        );
        return row;
      });
      return this.view(row);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        const raced = await this.database.monitoringSchedule.findUnique({
          where: { idempotencyKey },
        });
        if (
          raced &&
          raced.projectId === projectId &&
          raced.requestHash === requestHash
        )
          return this.view(raced);
        if (raced) throw new AnalysisServiceError("IDEMPOTENCY_CONFLICT", 409);
      }
      throw error;
    }
  }
  async updateSchedule(
    projectId: string,
    id: string,
    actor: AnalysisActor,
    input: ScheduleInput & { version: number },
  ) {
    const project = await this.project(projectId, actor.userId, "analysis.run");
    const existing = await this.database.monitoringSchedule.findFirst({
      where: { id, projectId },
    });
    if (!existing) throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    const estimate = await this.estimate(projectId, actor.userId, input);
    if (!estimate.eligibleRunCount)
      throw new AnalysisServiceError("ANALYSIS_HAS_NO_ELIGIBLE_RUNS", 409);
    if (BigInt(estimate.estimatedCostMicros) > BigInt(input.maxCostMicros))
      throw new AnalysisServiceError("MONITORING_BUDGET_EXCEEDED", 409);
    const { version, ...changes } = input;
    const result = await this.database.$transaction(async (tx) => {
      const updated = await tx.monitoringSchedule.updateMany({
        where: { id, projectId, version },
        data: {
          ...changes,
          timezone: project.timezone,
          maxCostMicros: BigInt(input.maxCostMicros),
          nextRunAt: nextMonitoringAt(
            { ...input, timezone: project.timezone },
            new Date(),
          ),
          version: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new AnalysisServiceError("VERSION_CONFLICT", 409);
      await this.audit(
        tx,
        project.workspaceId,
        actor,
        "monitoring.update",
        "MonitoringSchedule",
        id,
      );
      return tx.monitoringSchedule.findUniqueOrThrow({ where: { id } });
    });
    return this.view(result);
  }
  async setScheduleActive(
    projectId: string,
    id: string,
    actor: AnalysisActor,
    input: { active: boolean; version: number },
  ) {
    const project = await this.project(projectId, actor.userId, "analysis.run");
    const schedule = await this.database.monitoringSchedule.findFirst({
      where: { id, projectId },
    });
    if (!schedule) throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    const row = await this.database.$transaction(async (tx) => {
      const result = await tx.monitoringSchedule.updateMany({
        where: { id, projectId, version: input.version },
        data: {
          active: input.active,
          ...(input.active
            ? { nextRunAt: nextMonitoringAt(schedule, new Date()) }
            : {}),
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new AnalysisServiceError("VERSION_CONFLICT", 409);
      await this.audit(
        tx,
        project.workspaceId,
        actor,
        input.active ? "monitoring.resume" : "monitoring.pause",
        "MonitoringSchedule",
        id,
      );
      return tx.monitoringSchedule.findUniqueOrThrow({ where: { id } });
    });
    return this.view(row);
  }
  /** Each due execution has a unique key, a two-minute lease and at most three submissions. */
  async runDue(now = new Date()) {
    const schedules = await this.database.monitoringSchedule.findMany({
      where: { active: true, nextRunAt: { lte: now } },
      take: 50,
      include: { project: true, createdBy: true },
    });
    for (const schedule of schedules) {
      await this.database.$transaction(async (tx) => {
        const moved = await tx.monitoringSchedule.updateMany({
          where: {
            id: schedule.id,
            active: true,
            version: schedule.version,
            nextRunAt: schedule.nextRunAt,
          },
          data: {
            nextRunAt: nextMonitoringAt(schedule, now),
            version: { increment: 1 },
          },
        });
        if (!moved.count) return;
        const execution = await tx.monitoringExecution.create({
          data: {
            id: uuidv7(),
            scheduleId: schedule.id,
            dueAt: schedule.nextRunAt,
            promptIds: schedule.promptIds,
            modelConfigIds: schedule.modelConfigIds,
            maxCostMicros: schedule.maxCostMicros,
          },
        });
        await this.audit(
          tx,
          schedule.project.workspaceId,
          {
            userId: schedule.createdById,
            email: schedule.createdBy.displayEmail,
          },
          "monitoring.due",
          "MonitoringExecution",
          execution.id,
        );
      });
    }
    const pending = await this.database.monitoringExecution.findMany({
      where: {
        OR: [
          {
            status: "pending",
            OR: [{ retryAt: null }, { retryAt: { lte: now } }],
          },
          { status: "running", leaseUntil: { lte: now } },
        ],
      },
      take: 50,
      orderBy: { dueAt: "asc" },
      include: { schedule: { include: { project: true, createdBy: true } } },
    });
    for (const execution of pending) {
      const leaseUntil = new Date(now.getTime() + 120_000);
      const attempt = Math.min(3, execution.attempts + 1);
      const claimed = await this.database.monitoringExecution.updateMany({
        where: {
          id: execution.id,
          attempts: execution.attempts,
          status: execution.status,
          ...(execution.status === "running"
            ? { leaseUntil: { lte: now } }
            : {}),
        },
        data: {
          status: "running",
          attempts: attempt,
          leaseUntil,
          retryAt: null,
        },
      });
      if (!claimed.count) continue;
      const schedule = execution.schedule;
      const actor = {
        userId: schedule.createdById,
        email: schedule.createdBy.displayEmail,
      };
      const key = `monitor:${execution.id}`;
      try {
        const existing = await this.database.analysisJob.findUnique({
          where: { idempotencyKey: `analysis:${actor.userId}:${key}` },
        });
        if (execution.attempts >= 3 && !existing)
          throw new Error("MONITORING_RETRY_EXHAUSTED");
        if (!existing) {
          await this.project(schedule.projectId, actor.userId, "analysis.run");
          if (!schedule.active)
            throw new AnalysisServiceError("MONITORING_PAUSED", 409);
        }
        const job = (existing ??
          (await this.analysis.create(schedule.projectId, actor, key, {
            promptIds: execution.promptIds,
            modelConfigIds: execution.modelConfigIds,
            maxCostMicros: execution.maxCostMicros.toString(),
          }))) as { id: string };
        await this.finishExecution(
          execution.id,
          attempt,
          "submitted",
          null,
          job.id,
          actor,
          schedule.project.workspaceId,
          schedule.projectId,
          now,
          leaseUntil,
        );
      } catch (error) {
        const code =
          error instanceof Error &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "MONITORING_SUBMISSION_FAILED";
        const permanent = [
          "RESOURCE_NOT_FOUND",
          "PROJECT_NOT_READY",
          "MONITORING_PAUSED",
          "MONITORING_SELECTION_UNAVAILABLE",
          "MONITORING_BUDGET_EXCEEDED",
          "MONITORING_PRICE_UNAVAILABLE",
          "ANALYSIS_QUOTA_INSUFFICIENT",
          "ANALYSIS_HAS_NO_ELIGIBLE_RUNS",
        ].includes(code);
        if (permanent || attempt >= 3)
          await this.finishExecution(
            execution.id,
            attempt,
            permanent ? "skipped" : "dead_letter",
            code,
            null,
            actor,
            schedule.project.workspaceId,
            schedule.projectId,
            now,
            leaseUntil,
          );
        else
          await this.database.monitoringExecution.updateMany({
            where: {
              id: execution.id,
              status: "running",
              attempts: attempt,
              leaseUntil,
            },
            data: {
              status: "pending",
              errorCode: code,
              retryAt: new Date(now.getTime() + 60_000),
              leaseUntil: null,
            },
          });
      }
    }
    return { due: schedules.length, processed: pending.length };
  }
  private async finishExecution(
    id: string,
    attempt: number,
    status: "submitted" | "skipped" | "dead_letter",
    errorCode: string | null,
    jobId: string | null,
    actor: AnalysisActor,
    workspaceId: string,
    projectId: string,
    now: Date,
    leaseUntil: Date,
  ) {
    await this.database.$transaction(async (tx) => {
      const updated = await tx.monitoringExecution.updateMany({
        where: { id, status: "running", attempts: attempt, leaseUntil },
        data: {
          status,
          errorCode,
          analysisJobId: jobId,
          leaseUntil: null,
          completedAt: now,
        },
      });
      if (!updated.count) return;
      await this.audit(
        tx,
        workspaceId,
        actor,
        `monitoring.${status}`,
        "MonitoringExecution",
        id,
      );
      if (status !== "submitted")
        await this.writeNotice(tx, {
          userId: actor.userId,
          workspaceId,
          type: "monitoring.failure",
          title: status === "skipped" ? "监测未执行" : "监测执行失败",
          body:
            (
              {
                RESOURCE_NOT_FOUND:
                  "创建者的项目权限已变更，请联系工作区管理员。",
                PROJECT_NOT_READY: "项目当前无法运行分析，请检查项目状态。",
                MONITORING_PAUSED: "计划已暂停。",
                MONITORING_SELECTION_UNAVAILABLE:
                  "部分问题或模型已停用，请检查计划配置。",
                MONITORING_PRICE_UNAVAILABLE:
                  "模型价格尚未配置，请联系管理员补齐后重试。",
                MONITORING_BUDGET_EXCEEDED:
                  "预计费用超过单次上限，请调整计划配置或费用上限。",
                ANALYSIS_QUOTA_INSUFFICIENT: "工作区可用额度不足。",
                ANALYSIS_HAS_NO_ELIGIBLE_RUNS:
                  "当前没有可执行的问题与模型组合。",
              } as Record<string, string>
            )[errorCode ?? ""] ??
            "本次监测提交失败，已停止重试。请联系管理员检查执行记录。",
          href: `/projects/${projectId}/monitoring`,
          objectType: "MonitoringExecution",
          objectId: id,
          idempotencyKey: `monitoring:${id}:${actor.userId}`,
        });
    });
  }
  async tasks(projectId: string, userId: string) {
    await this.project(projectId, userId, "report.view");
    const tasks = await this.database.optimizationTask.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { id: true, displayEmail: true } },
        baselineJob: {
          include: {
            runs: {
              select: {
                promptVersionId: true,
                modelConfigVersionId: true,
                scopeHash: true,
                nativeWebSearchEnabled: true,
                webSearchToolVersion: true,
              },
            },
          },
        },
        retests: {
          orderBy: { createdAt: "desc" },
          include: {
            analysisJob: {
              include: {
                runs: {
                  select: {
                    promptVersionId: true,
                    modelConfigVersionId: true,
                    scopeHash: true,
                    nativeWebSearchEnabled: true,
                    webSearchToolVersion: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const scores = await this.database.visibilityScore.findMany({
      where: {
        analysisJobId: {
          in: tasks.flatMap((task) => [
            task.baselineJobId,
            ...task.retests.map((retest) => retest.analysisJobId),
          ]),
        },
      },
    });
    const byJob = new Map(scores.map((score) => [score.analysisJobId, score]));
    const condition = (
      runs: readonly {
        promptVersionId: string;
        modelConfigVersionId: string;
        scopeHash: string;
        nativeWebSearchEnabled: boolean;
        webSearchToolVersion: string | null;
      }[],
    ) =>
      JSON.stringify(
        runs
          .map((run) => [
            run.promptVersionId,
            run.modelConfigVersionId,
            run.scopeHash,
            run.nativeWebSearchEnabled,
            run.webSearchToolVersion,
          ])
          .map((row) => JSON.stringify(row))
          .sort(),
      );
    return this.view(
      tasks.map((task) => {
        const baseline = byJob.get(task.baselineJobId);
        return {
          ...task,
          baselineJob: {
            id: task.baselineJob.id,
            status: task.baselineJob.status,
            createdAt: task.baselineJob.createdAt,
          },
          baselineScore: baseline ? Number(baseline.overallScore) : null,
          retests: task.retests.map((retest) => {
            const score = byJob.get(retest.analysisJobId);
            const comparable = Boolean(
              baseline &&
              score &&
              !baseline.diagnosticOnly &&
              !score.diagnosticOnly &&
              baseline.scoreVersion === score.scoreVersion &&
              baseline.parserVersion === score.parserVersion &&
              baseline.validSampleCount === task.baselineJob.totalRuns &&
              score.validSampleCount === retest.analysisJob.totalRuns &&
              condition(task.baselineJob.runs) ===
                condition(retest.analysisJob.runs),
            );
            return {
              id: retest.id,
              analysisJobId: retest.analysisJobId,
              createdAt: retest.createdAt,
              status: retest.analysisJob.status,
              score: score ? Number(score.overallScore) : null,
              comparable,
              delta:
                comparable && baseline && score
                  ? Math.round(
                      (Number(score.overallScore) -
                        Number(baseline.overallScore)) *
                        10,
                    ) / 10
                  : null,
            };
          }),
        };
      }),
    );
  }
  async createTask(
    projectId: string,
    actor: AnalysisActor,
    input: OptimizationInput,
  ) {
    const project = await this.project(
      projectId,
      actor.userId,
      "optimization.manage",
    );
    const baseline = await this.database.analysisJob.findFirst({
      where: {
        id: input.baselineJobId,
        projectId,
        status: { in: ["completed", "partially_completed"] },
      },
    });
    if (!baseline) throw new AnalysisServiceError("BASELINE_UNAVAILABLE", 409);
    await this.assignee(project.workspaceId, input.assigneeId);
    const id = uuidv7();
    const task = await this.database.$transaction(async (tx) => {
      const task = await tx.optimizationTask.create({
        data: {
          ...input,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          id,
          projectId,
          createdById: actor.userId,
        },
      });
      await this.audit(
        tx,
        project.workspaceId,
        actor,
        "optimization.create",
        "OptimizationTask",
        id,
      );
      return task;
    });
    return this.view(task);
  }
  async updateTask(
    projectId: string,
    id: string,
    actor: AnalysisActor,
    input: OptimizationUpdate,
  ) {
    const project = await this.project(
      projectId,
      actor.userId,
      "optimization.manage",
    );
    await this.assignee(project.workspaceId, input.assigneeId);
    await this.database.$transaction(async (tx) => {
      const { version, ...changes } = input;
      const result = await tx.optimizationTask.updateMany({
        where: { id, projectId, version },
        data: {
          ...changes,
          dueAt: changes.dueAt ? new Date(changes.dueAt) : null,
          version: { increment: 1 },
        },
      });
      if (!result.count)
        throw new AnalysisServiceError("VERSION_CONFLICT", 409);
      await this.audit(
        tx,
        project.workspaceId,
        actor,
        "optimization.update",
        "OptimizationTask",
        id,
      );
    });
    return this.view(
      await this.database.optimizationTask.findUniqueOrThrow({ where: { id } }),
    );
  }
  async retest(
    projectId: string,
    id: string,
    actor: AnalysisActor,
    key: string,
    maxCostMicros: string,
  ) {
    const project = await this.project(projectId, actor.userId, "analysis.run");
    await this.project(projectId, actor.userId, "optimization.manage");
    if (!key || key.length > 70)
      throw new AnalysisServiceError("IDEMPOTENCY_KEY_REQUIRED", 400);
    const task = await this.database.optimizationTask.findFirst({
      where: { id, projectId },
    });
    if (!task) throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    const job = (await this.analysis.create(
      projectId,
      actor,
      `retest:${id}:${key}`,
      { sourceJobId: task.baselineJobId, maxCostMicros },
    )) as { id: string };
    await this.database.$transaction(async (tx) => {
      const exists = await tx.optimizationRetest.findUnique({
        where: { analysisJobId: job.id },
      });
      if (exists) return;
      await tx.optimizationRetest.upsert({
        where: { analysisJobId: job.id },
        update: {},
        create: { id: uuidv7(), taskId: id, analysisJobId: job.id },
      });
      await this.audit(
        tx,
        project.workspaceId,
        actor,
        "optimization.retest",
        "OptimizationTask",
        id,
      );
    });
    return { analysisJobId: job.id };
  }
  private async assignee(workspaceId: string, userId?: string | null) {
    if (
      userId &&
      !(await this.database.workspaceMembership.findFirst({
        where: {
          workspaceId,
          userId,
          status: "active",
          user: { status: "active" },
        },
      }))
    )
      throw new AnalysisServiceError("ASSIGNEE_UNAVAILABLE", 400);
  }
  private view<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as T;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    actor: AnalysisActor,
    action: string,
    objectType: string,
    objectId: string,
  ) {
    const requestId = `monitoring_${uuidv7()}`;
    const context = getRequestContext() ?? {
      requestId,
      traceId: createHash("sha256")
        .update(requestId)
        .digest("hex")
        .slice(0, 32),
    };
    await tx.auditLog.create({
      data: {
        id: uuidv7(),
        action,
        actorId: actor.userId,
        actorType: "user",
        actorEmailMask: actor.email.replace(/^(.{0,2}).*(@.*)$/, "$1***$2"),
        workspaceId,
        objectId,
        objectType,
        outcome: "success",
        riskLevel: "medium",
        requestId: context.requestId,
        traceId: context.traceId,
      },
    });
  }
}
