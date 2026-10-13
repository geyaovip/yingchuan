import { createHash } from "node:crypto";

import {
  AnalysisJobStatus,
  AuditOutcome,
  MembershipStatus,
  ModelRunStatus,
  RunAttemptStatus,
  UsageEntryType,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import {
  ANALYSIS_OUTPUT_TOKEN_LIMIT,
  ModelGatewayError,
} from "@yingchuan/model-gateway";
import type {
  AnalysisSelection,
  ModelGatewayApplicationService,
} from "@yingchuan/model-gateway";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

export interface AnalysisActor {
  readonly email: string;
  readonly userId: string;
}

export class AnalysisServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(code);
    this.name = "AnalysisServiceError";
  }
}

const jobInclude = {
  runs: {
    include: {
      attempts: { orderBy: { attemptNumber: "desc" as const }, take: 1 },
      modelConfigVersion: {
        include: {
          modelConfig: { select: { displayName: true, modelFamily: true } },
        },
      },
      promptVersion: { select: { category: true, text: true } },
      mentions: { orderBy: { createdAt: "asc" as const } },
      parseResult: true,
      result: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.AnalysisJobInclude;

export class AnalysisApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly gateway: ModelGatewayApplicationService,
  ) {}

  async create(
    projectId: string,
    actor: AnalysisActor,
    idempotencyKey: string,
    selection: AnalysisSelection = {},
  ) {
    if (!idempotencyKey || idempotencyKey.length > 120)
      throw new AnalysisServiceError("IDEMPOTENCY_KEY_REQUIRED", 400);
    const key = `analysis:${actor.userId}:${idempotencyKey}`;
    const existing = await this.database.analysisJob.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      if (existing.projectId !== projectId)
        throw new AnalysisServiceError("IDEMPOTENCY_CONFLICT", 409);
      return this.get(existing.id, actor.userId);
    }
    const estimate = await this.gateway.estimate(
      projectId,
      actor.userId,
      selection,
    );
    const eligible = estimate.items.filter(
      (item) => item.status === "eligible",
    );
    if (eligible.length === 0)
      throw new AnalysisServiceError("ANALYSIS_HAS_NO_ELIGIBLE_RUNS", 409);
    const promptVersions = await this.database.promptVersion.findMany({
      where: { id: { in: eligible.map((item) => item.promptVersionId) } },
    });
    const modelVersions = await this.database.modelConfigVersion.findMany({
      where: { id: { in: eligible.map((item) => item.modelVersionId) } },
    });
    if (
      selection.maxCostMicros !== undefined &&
      modelVersions.some(
        (version) =>
          version.inputPriceMicrosPerMillion === null ||
          version.outputPriceMicrosPerMillion === null,
      )
    )
      throw new AnalysisServiceError("MONITORING_PRICE_UNAVAILABLE", 409);
    const promptById = new Map(promptVersions.map((item) => [item.id, item]));
    const modelById = new Map(modelVersions.map((item) => [item.id, item]));
    const project = await this.database.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const cost = BigInt(estimate.estimatedCostMicros);
    if (
      selection.maxCostMicros !== undefined &&
      cost > BigInt(selection.maxCostMicros)
    )
      throw new AnalysisServiceError("MONITORING_BUDGET_EXCEEDED", 409);
    const frozenRuns = selection.sourceJobId
      ? await this.database.modelRun.findMany({
          where: { analysisJobId: selection.sourceJobId },
          orderBy: { id: "asc" },
        })
      : [];
    const jobId = uuidv7();
    const reservationId = uuidv7();
    const context = this.context();
    try {
      await this.database.$transaction(
        async (transaction) => {
          const balance = await transaction.usageLedgerEntry.aggregate({
            _sum: { quantityMicros: true },
            where: {
              resourceType: "model_cost",
              workspaceId: project.workspaceId,
            },
          });
          if ((balance._sum.quantityMicros ?? 0n) < cost)
            throw new AnalysisServiceError("ANALYSIS_QUOTA_INSUFFICIENT", 409);
          await transaction.usageLedgerEntry.create({
            data: {
              entryType: UsageEntryType.reservation,
              id: reservationId,
              idempotencyKey: `${key}:reservation`,
              metadata: { eligibleRunCount: eligible.length },
              projectId,
              quantityMicros: -cost,
              relatedJobId: jobId,
              resourceType: "model_cost",
              source: "analysis_job",
              userId: actor.userId,
              workspaceId: project.workspaceId,
            },
          });
          await transaction.analysisJob.create({
            data: {
              createdById: actor.userId,
              estimateSnapshot: estimate as unknown as Prisma.InputJsonValue,
              estimatedCostMicros: cost,
              id: jobId,
              idempotencyKey: key,
              projectId,
              queuedRuns: eligible.length,
              reservedLedgerEntryId: reservationId,
              skippedRuns: estimate.skippedRunCount,
              totalRuns: eligible.length,
              workspaceId: project.workspaceId,
            },
          });
          for (const [index, item] of eligible.entries()) {
            const prompt = promptById.get(item.promptVersionId);
            const model = modelById.get(item.modelVersionId);
            if (!prompt || !model)
              throw new AnalysisServiceError("ANALYSIS_SNAPSHOT_STALE", 409);
            const frozen = frozenRuns.find(
              (run) =>
                run.promptVersionId === item.promptVersionId &&
                run.modelConfigVersionId === item.modelVersionId,
            );
            const scope = frozen
              ? frozen.scopeSnapshot
              : {
                  city: prompt.city,
                  country: prompt.country,
                  district: prompt.district,
                  nearbyLandmark: prompt.nearbyLandmark,
                  province: prompt.province,
                  scope: prompt.scope,
                  targetStoreId: prompt.targetStoreId,
                };
            const runId = uuidv7();
            const webConfig = model.webSearchConfig as Record<
              string,
              unknown
            > | null;
            await transaction.modelRun.create({
              data: {
                analysisJobId: jobId,
                apiModeSnapshot: model.apiMode,
                estimatedCostMicros: BigInt(item.estimatedCostMicros),
                id: runId,
                inputPriceMicrosPerMillion: model.inputPriceMicrosPerMillion,
                modelCodeSnapshot: model.modelCode,
                modelConfigVersionId: model.id,
                nativeWebSearchEnabled:
                  frozen?.nativeWebSearchEnabled ?? prompt.requiresWebSearch,
                outputPriceMicrosPerMillion: model.outputPriceMicrosPerMillion,
                promptTextSnapshot: frozen?.promptTextSnapshot ?? prompt.text,
                promptVersionId: prompt.id,
                scopeHash: frozen?.scopeHash ?? this.hash(scope),
                scopeSnapshot: scope as Prisma.InputJsonValue,
                sampleIndex: frozen?.sampleIndex ?? 0,
                webSearchConfigSnapshot: (frozen?.webSearchConfigSnapshot ??
                  webConfig) as Prisma.InputJsonValue | undefined,
                webSearchToolVersion:
                  frozen?.webSearchToolVersion ??
                  (typeof webConfig?.toolVersion === "string"
                    ? webConfig.toolVersion
                    : prompt.requiresWebSearch
                      ? "ark-native-web-v1"
                      : undefined),
              },
            });
            await transaction.outboxEvent.create({
              data: {
                actorId: actor.userId,
                actorType: "user",
                aggregateId: runId,
                aggregateType: "ModelRun",
                aggregateVersion: 1,
                eventType: "analysis.model-run.requested",
                id: uuidv7(),
                idempotencyKey: `model-run:${runId}:attempt:1`,
                payload: {
                  analysisJobId: jobId,
                  batchIndex: index,
                  modelRunId: runId,
                },
                traceId: context.traceId,
                workspaceId: project.workspaceId,
              },
            });
          }
          await this.audit(
            transaction,
            actor,
            "analysis.create",
            jobId,
            project.workspaceId,
          );
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (this.uniqueConflict(error)) {
        const raced = await this.database.analysisJob.findUnique({
          where: { idempotencyKey: key },
        });
        if (raced) {
          if (raced.projectId !== projectId)
            throw new AnalysisServiceError("IDEMPOTENCY_CONFLICT", 409);
          return this.get(raced.id, actor.userId);
        }
      }
      throw error;
    }
    return this.get(jobId, actor.userId);
  }

  async get(jobId: string, actorId: string) {
    const job = await this.database.analysisJob.findUnique({
      include: jobInclude,
      where: { id: jobId },
    });
    if (
      !job ||
      !(await this.hasPermission(job.workspaceId, actorId, "report.view"))
    )
      throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    return this.jobView(job);
  }

  async list(projectId: string, actorId: string) {
    const project = await this.database.project.findUnique({
      where: { id: projectId },
    });
    if (
      !project ||
      !(await this.hasPermission(project.workspaceId, actorId, "report.view"))
    )
      throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    const jobs = await this.database.analysisJob.findMany({
      orderBy: { createdAt: "desc" },
      where: { projectId },
    });
    return jobs.map((job) => this.jobView(job));
  }

  async cancel(
    jobId: string,
    reason: string | undefined,
    actor: AnalysisActor,
  ) {
    const job = await this.database.analysisJob.findUnique({
      where: { id: jobId },
    });
    if (
      !job ||
      !(await this.hasPermission(job.workspaceId, actor.userId, "analysis.run"))
    )
      throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    if (this.terminal(job.status))
      throw new AnalysisServiceError("ANALYSIS_NOT_CANCELLABLE", 409);
    await this.database.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.analysisJob.update({
        data: {
          cancellationReason: reason?.trim(),
          cancellationRequestedAt: now,
          cancelledById: actor.userId,
          version: { increment: 1 },
        },
        where: { id: jobId },
      });
      await transaction.modelRun.updateMany({
        data: { completedAt: now, status: ModelRunStatus.cancelled },
        where: { analysisJobId: jobId, status: ModelRunStatus.queued },
      });
      await this.coordinate(transaction, jobId);
      await this.audit(
        transaction,
        actor,
        "analysis.cancel",
        jobId,
        job.workspaceId,
      );
    });
    return this.get(jobId, actor.userId);
  }

  async retry(jobId: string, actor: AnalysisActor) {
    await this.retryInternal(jobId, actor, false);
    return this.get(jobId, actor.userId);
  }

  async retryAsAdmin(jobId: string, actor: AnalysisActor) {
    const admin = await this.database.platformRoleAssignment.findFirst({
      where: { role: { code: "super_admin" }, userId: actor.userId },
    });
    if (!admin) throw new AnalysisServiceError("FORBIDDEN", 403);
    await this.retryInternal(jobId, actor, true);
    return this.database.analysisJob.findUniqueOrThrow({
      include: jobInclude,
      where: { id: jobId },
    });
  }

  private async retryInternal(
    jobId: string,
    actor: AnalysisActor,
    admin: boolean,
  ) {
    const job = await this.database.analysisJob.findUnique({
      include: { runs: true },
      where: { id: jobId },
    });
    if (
      !job ||
      (!admin &&
        !(await this.hasPermission(
          job.workspaceId,
          actor.userId,
          "analysis.run",
        )))
    )
      throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    const retryable = job.runs.filter(
      (run) => run.status === ModelRunStatus.failed && run.retryable,
    );
    if (!retryable.length)
      throw new AnalysisServiceError("ANALYSIS_NO_RETRYABLE_RUNS", 409);
    await this.database.$transaction(async (transaction) => {
      for (const run of retryable) {
        const attempts = await transaction.runAttempt.count({
          where: { modelRunId: run.id },
        });
        await transaction.modelRun.update({
          data: {
            completedAt: null,
            errorCategory: null,
            errorCode: null,
            retryable: null,
            status: ModelRunStatus.queued,
          },
          where: { id: run.id },
        });
        await transaction.outboxEvent.create({
          data: {
            actorId: actor.userId,
            actorType: "user",
            aggregateId: run.id,
            aggregateType: "ModelRun",
            aggregateVersion: run.version + 1,
            eventType: "analysis.model-run.requested",
            id: uuidv7(),
            idempotencyKey: `model-run:${run.id}:attempt:${attempts + 1}`,
            payload: { analysisJobId: jobId, modelRunId: run.id },
            traceId: this.context().traceId,
            workspaceId: job.workspaceId,
          },
        });
      }
      await transaction.analysisJob.update({
        data: {
          completedAt: null,
          status: AnalysisJobStatus.queued,
          version: { increment: 1 },
        },
        where: { id: jobId },
      });
      await this.coordinate(transaction, jobId, false);
      await this.audit(
        transaction,
        actor,
        "analysis.retry",
        jobId,
        job.workspaceId,
      );
    });
  }

  async executeEvent(eventId: string): Promise<boolean> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "analysis.model-run.requested")
      return false;
    const claimed = await this.database.$transaction(async (transaction) => {
      if (
        await transaction.inboxReceipt.findUnique({
          where: {
            consumer_eventId: { consumer: "analysis-model-run", eventId },
          },
        })
      )
        return null;
      const run = await transaction.modelRun.findUnique({
        include: { analysisJob: true, attempts: true },
        where: { id: event.aggregateId },
      });
      if (!run) return null;
      if (run.analysisJob.cancellationRequestedAt) {
        await transaction.modelRun.update({
          data: { completedAt: new Date(), status: ModelRunStatus.cancelled },
          where: { id: run.id },
        });
        await transaction.inboxReceipt.create({
          data: { consumer: "analysis-model-run", eventId, id: uuidv7() },
        });
        await this.coordinate(transaction, run.analysisJobId);
        return null;
      }
      const updated = await transaction.modelRun.updateMany({
        data: {
          startedAt: new Date(),
          status: ModelRunStatus.running,
          version: { increment: 1 },
        },
        where: { id: run.id, status: ModelRunStatus.queued },
      });
      if (updated.count !== 1) return null;
      const attemptNumber = run.attempts.length + 1;
      const attempt = await transaction.runAttempt.create({
        data: {
          attemptNumber,
          id: uuidv7(),
          modelRunId: run.id,
          status: RunAttemptStatus.running,
        },
      });
      await transaction.analysisJob.update({
        data: {
          startedAt: run.analysisJob.startedAt ?? new Date(),
          status: AnalysisJobStatus.running,
        },
        where: { id: run.analysisJobId },
      });
      return { attempt, run };
    });
    if (!claimed) return false;
    const { attempt, run } = claimed;
    try {
      const webConfig = run.webSearchConfigSnapshot as Record<
        string,
        unknown
      > | null;
      const response = await this.gateway.invokeVersion(
        run.modelConfigVersionId,
        {
          nativeWebSearch: run.nativeWebSearchEnabled
            ? {
                enabled: true,
                toolConfig: webConfig ?? { type: "web_search" },
                toolVersion: run.webSearchToolVersion ?? "ark-native-web-v1",
              }
            : undefined,
          projectId: run.analysisJob.projectId,
          maxOutputTokens: ANALYSIS_OUTPUT_TOKEN_LIMIT,
          prompt: run.promptTextSnapshot,
          requestId: `model-run-${run.id}-attempt-${attempt.attemptNumber}`,
          workspaceId: run.analysisJob.workspaceId,
        },
      );
      await this.database.$transaction(async (transaction) => {
        const cost = this.cost(
          run,
          response.inputTokens,
          response.outputTokens,
        );
        await transaction.modelRunResult.upsert({
          create: {
            citations: response.citations as unknown as Prisma.InputJsonValue,
            costMicros: cost,
            finishReason: response.finishReason,
            id: uuidv7(),
            inputTokens: response.inputTokens,
            modelRunId: run.id,
            outputTokens: response.outputTokens,
            responseHash: this.hash(response.text),
            responseText: response.text,
          },
          update: {},
          where: { modelRunId: run.id },
        });
        await transaction.runAttempt.update({
          data: {
            completedAt: new Date(),
            providerRequestId: response.providerRequestId,
            status: RunAttemptStatus.succeeded,
          },
          where: { id: attempt.id },
        });
        await transaction.modelRun.update({
          data: {
            completedAt: new Date(),
            providerRequestId: response.providerRequestId,
            status: ModelRunStatus.succeeded,
          },
          where: { id: run.id },
        });
        await transaction.outboxEvent.upsert({
          create: {
            actorId: run.analysisJob.createdById,
            actorType: "user",
            aggregateId: run.id,
            aggregateType: "ModelRun",
            aggregateVersion: run.version + 1,
            eventType: "response.parse.requested",
            id: uuidv7(),
            idempotencyKey: `parse:${run.id}:parser-v1`,
            payload: { analysisJobId: run.analysisJobId, modelRunId: run.id },
            traceId: this.context().traceId,
            workspaceId: run.analysisJob.workspaceId,
          },
          update: {},
          where: { idempotencyKey: `parse:${run.id}:parser-v1` },
        });
        await this.finishEvent(transaction, eventId, run.analysisJobId);
      });
    } catch (error) {
      const known = error instanceof ModelGatewayError;
      const unknown = known && error.category === "timeout";
      await this.database.$transaction(async (transaction) => {
        await transaction.runAttempt.update({
          data: {
            completedAt: new Date(),
            errorCategory: known ? error.category : "unknown",
            errorCode: known ? error.code : "MODEL_CALL_FAILED",
            status: unknown
              ? RunAttemptStatus.outcome_unknown
              : RunAttemptStatus.failed,
          },
          where: { id: attempt.id },
        });
        await transaction.modelRun.update({
          data: {
            completedAt: new Date(),
            errorCategory: known ? error.category : "unknown",
            errorCode: known ? error.code : "MODEL_CALL_FAILED",
            retryable: known ? error.retryable && !unknown : false,
            status: unknown
              ? ModelRunStatus.outcome_unknown
              : ModelRunStatus.failed,
          },
          where: { id: run.id },
        });
        await this.finishEvent(transaction, eventId, run.analysisJobId);
      });
    }
    return true;
  }

  async reconcile(staleAfterMs = 5 * 60_000): Promise<number> {
    const stale = await this.database.modelRun.findMany({
      where: {
        startedAt: { lt: new Date(Date.now() - staleAfterMs) },
        status: ModelRunStatus.running,
      },
    });
    for (const run of stale) {
      await this.database.$transaction(async (transaction) => {
        await transaction.modelRun.update({
          data: {
            completedAt: new Date(),
            errorCategory: "unknown",
            errorCode: "RUN_STUCK_OUTCOME_UNKNOWN",
            retryable: false,
            status: ModelRunStatus.outcome_unknown,
          },
          where: { id: run.id },
        });
        await transaction.runAttempt.updateMany({
          data: {
            completedAt: new Date(),
            errorCategory: "unknown",
            errorCode: "RUN_STUCK_OUTCOME_UNKNOWN",
            status: RunAttemptStatus.outcome_unknown,
          },
          where: { modelRunId: run.id, status: RunAttemptStatus.running },
        });
        await this.coordinate(transaction, run.analysisJobId);
      });
    }
    return stale.length;
  }

  async failEvent(eventId: string, code: string): Promise<void> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "analysis.model-run.requested") return;
    await this.database.$transaction(async (transaction) => {
      const run = await transaction.modelRun.findUnique({
        where: { id: event.aggregateId },
      });
      if (
        !run ||
        run.status === ModelRunStatus.succeeded ||
        run.status === ModelRunStatus.cancelled
      )
        return;
      await transaction.modelRun.update({
        data: {
          completedAt: new Date(),
          errorCategory: "worker",
          errorCode: code,
          retryable: false,
          status: ModelRunStatus.failed,
        },
        where: { id: run.id },
      });
      await transaction.runAttempt.updateMany({
        data: {
          completedAt: new Date(),
          errorCategory: "worker",
          errorCode: code,
          status: RunAttemptStatus.failed,
        },
        where: { modelRunId: run.id, status: RunAttemptStatus.running },
      });
      await transaction.inboxReceipt.upsert({
        create: { consumer: "analysis-model-run", eventId, id: uuidv7() },
        update: {},
        where: {
          consumer_eventId: { consumer: "analysis-model-run", eventId },
        },
      });
      await this.coordinate(transaction, run.analysisJobId);
    });
  }

  private async finishEvent(
    transaction: Prisma.TransactionClient,
    eventId: string,
    jobId: string,
  ) {
    await transaction.inboxReceipt.create({
      data: { consumer: "analysis-model-run", eventId, id: uuidv7() },
    });
    await this.coordinate(transaction, jobId);
  }

  private async coordinate(
    transaction: Prisma.TransactionClient,
    jobId: string,
    settle = true,
  ) {
    const job = await transaction.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    const counts = await transaction.modelRun.groupBy({
      _count: { _all: true },
      by: ["status"],
      where: { analysisJobId: jobId },
    });
    const count = (status: ModelRunStatus) =>
      counts.find((item) => item.status === status)?._count._all ?? 0;
    const queued = count(ModelRunStatus.queued);
    const running = count(ModelRunStatus.running);
    const succeeded = count(ModelRunStatus.succeeded);
    const failed =
      count(ModelRunStatus.failed) + count(ModelRunStatus.outcome_unknown);
    const cancelled = count(ModelRunStatus.cancelled);
    const done = queued === 0 && running === 0;
    let status: AnalysisJobStatus =
      running > 0 ? AnalysisJobStatus.running : AnalysisJobStatus.queued;
    if (done) {
      if (succeeded === job.totalRuns) status = AnalysisJobStatus.completed;
      else if (succeeded > 0) status = AnalysisJobStatus.partially_completed;
      else if (failed > 0) status = AnalysisJobStatus.failed;
      else status = AnalysisJobStatus.cancelled;
    }
    await transaction.analysisJob.update({
      data: {
        cancelledAt: done && cancelled > 0 ? new Date() : undefined,
        cancelledRuns: cancelled,
        completedAt: done ? new Date() : null,
        failedRuns: failed,
        queuedRuns: queued,
        runningRuns: running,
        status,
        succeededRuns: succeeded,
        version: { increment: 1 },
      },
      where: { id: jobId },
    });
    if (done && settle) await this.settleUsage(transaction, job);
  }

  private async settleUsage(
    transaction: Prisma.TransactionClient,
    job: {
      createdById: string;
      estimatedCostMicros: bigint;
      id: string;
      projectId: string;
      workspaceId: string;
    },
  ) {
    const aggregate = await transaction.modelRunResult.aggregate({
      _sum: { costMicros: true },
      where: { modelRun: { analysisJobId: job.id } },
    });
    const actual = aggregate._sum.costMicros ?? 0n;
    await transaction.usageLedgerEntry.upsert({
      create: {
        entryType: UsageEntryType.release,
        id: uuidv7(),
        idempotencyKey: `analysis:${job.id}:release`,
        projectId: job.projectId,
        quantityMicros: job.estimatedCostMicros,
        relatedJobId: job.id,
        resourceType: "model_cost",
        source: "analysis_reservation_release",
        userId: job.createdById,
        workspaceId: job.workspaceId,
      },
      update: {},
      where: { idempotencyKey: `analysis:${job.id}:release` },
    });
    const chargedAggregate = await transaction.usageLedgerEntry.aggregate({
      _sum: { quantityMicros: true },
      where: { relatedJobId: job.id, source: "analysis_actual_cost" },
    });
    const charged = -(chargedAggregate._sum.quantityMicros ?? 0n);
    const delta = actual - charged;
    if (delta === 0n) return;
    const settlementKey = `analysis:${job.id}:actual:${actual.toString()}`;
    await transaction.usageLedgerEntry.upsert({
      create: {
        entryType:
          delta > 0n ? UsageEntryType.debit : UsageEntryType.adjustment,
        id: uuidv7(),
        idempotencyKey: settlementKey,
        projectId: job.projectId,
        quantityMicros: -delta,
        relatedJobId: job.id,
        resourceType: "model_cost",
        source: "analysis_actual_cost",
        userId: job.createdById,
        workspaceId: job.workspaceId,
      },
      update: {},
      where: { idempotencyKey: settlementKey },
    });
  }

  private jobView<
    T extends { estimatedCostMicros: bigint; runs?: readonly unknown[] },
  >(job: T) {
    return JSON.parse(
      JSON.stringify(job, (_, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ) as unknown;
  }

  private async hasPermission(
    workspaceId: string,
    actorId: string,
    permission: string,
  ) {
    return Boolean(
      await this.database.workspaceMembership.findFirst({
        where: {
          role: {
            rolePermissions: { some: { permission: { code: permission } } },
          },
          status: MembershipStatus.active,
          userId: actorId,
          workspaceId,
        },
      }),
    );
  }

  private terminal(status: AnalysisJobStatus) {
    return (
      status === AnalysisJobStatus.completed ||
      status === AnalysisJobStatus.partially_completed ||
      status === AnalysisJobStatus.failed ||
      status === AnalysisJobStatus.cancelled
    );
  }

  private cost(
    run: {
      inputPriceMicrosPerMillion: bigint | null;
      outputPriceMicrosPerMillion: bigint | null;
    },
    inputTokens: number,
    outputTokens: number,
  ) {
    return (
      (BigInt(inputTokens) * (run.inputPriceMicrosPerMillion ?? 0n) +
        BigInt(outputTokens) * (run.outputPriceMicrosPerMillion ?? 0n) +
        999_999n) /
      1_000_000n
    );
  }

  private context() {
    return (
      getRequestContext() ?? {
        requestId: `internal_${uuidv7()}`,
        traceId: this.hash(uuidv7()).slice(0, 32),
      }
    );
  }

  private hash(value: unknown) {
    return createHash("sha256")
      .update(typeof value === "string" ? value : JSON.stringify(value))
      .digest("hex");
  }

  private uniqueConflict(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    actor: AnalysisActor,
    action: string,
    objectId: string,
    workspaceId: string,
  ) {
    const context = this.context();
    const [name = "", domain = ""] = actor.email.split("@");
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: `${name.slice(0, 2)}***@${domain}`,
        actorId: actor.userId,
        actorType: "user",
        id: uuidv7(),
        objectId,
        objectType: "AnalysisJob",
        outcome: AuditOutcome.success,
        requestId: context.requestId,
        riskLevel: "medium",
        traceId: context.traceId,
        workspaceId,
      },
    });
  }
}
