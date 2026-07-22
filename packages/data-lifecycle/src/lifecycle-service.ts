import { unlink } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  AuditOutcome,
  AuthAudience,
  DataLifecycleRunStatus,
  LegalHoldScopeType,
  Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

const retentionMs = 180 * 24 * 60 * 60 * 1000;
const maxRecordsPerCategory = 1_000;

export interface LegalHoldActor {
  readonly audience: AuthAudience;
  readonly email: string;
  readonly stepUpUntil?: Date | null;
  readonly userId: string;
}

export interface CreateLegalHoldInput {
  readonly reason: string;
  readonly scopeId: string;
  readonly scopeType: LegalHoldScopeType;
}

interface LifecycleCounts {
  agentConversationsPurged: number;
  contentSnapshotsPurged: number;
  heldRecordsSkipped: number;
  modelResponsesPurged: number;
  privateFileFailures: number;
}

export class DataLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class DataLifecycleApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly privateFileRoot: string,
  ) {}

  async listLegalHolds(actor: LegalHoldActor) {
    await this.requireAdmin(actor, false);
    return this.database.legalHold.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createLegalHold(input: CreateLegalHoldInput, actor: LegalHoldActor) {
    await this.requireAdmin(actor, true);
    const reason = input.reason.trim();
    if (reason.length < 3 || reason.length > 500)
      throw new DataLifecycleError(
        "LEGAL_HOLD_REASON_INVALID",
        "Legal hold reason must contain 3 to 500 characters.",
      );
    await this.assertScopeExists(input.scopeType, input.scopeId);
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.legalHold.findFirst({
        where: {
          active: true,
          scopeId: input.scopeId,
          scopeType: input.scopeType,
        },
      });
      if (existing) return existing;
      const hold = await transaction.legalHold.create({
        data: {
          createdById: actor.userId,
          id: uuidv7(),
          reason,
          scopeId: input.scopeId,
          scopeType: input.scopeType,
        },
      });
      await this.audit(
        transaction,
        actor,
        "data_lifecycle.legal_hold.create",
        "LegalHold",
        hold.id,
        { reason, scopeId: input.scopeId, scopeType: input.scopeType },
      );
      return hold;
    });
  }

  async releaseLegalHold(holdId: string, actor: LegalHoldActor) {
    await this.requireAdmin(actor, true);
    return this.database.$transaction(async (transaction) => {
      const hold = await transaction.legalHold.findUnique({
        where: { id: holdId },
      });
      if (!hold)
        throw new DataLifecycleError(
          "LEGAL_HOLD_NOT_FOUND",
          "Legal hold was not found.",
        );
      if (!hold.active) return hold;
      const released = await transaction.legalHold.update({
        data: {
          active: false,
          releasedAt: new Date(),
          releasedById: actor.userId,
        },
        where: { id: holdId },
      });
      await this.audit(
        transaction,
        actor,
        "data_lifecycle.legal_hold.release",
        "LegalHold",
        hold.id,
        { active: false },
      );
      return released;
    });
  }

  async runScheduled(referenceTime = new Date()) {
    const retry = await this.database.dataLifecycleRun.findFirst({
      orderBy: { updatedAt: "asc" },
      where: {
        attempts: { lt: 3 },
        status: DataLifecycleRunStatus.failed,
      },
    });
    if (retry)
      return this.run(retry.idempotencyKey, retry.cutoffAt, retry.timeoutMs);
    const bucket = referenceTime.toISOString().slice(0, 13);
    return this.run(`data-lifecycle/${bucket}`, referenceTime);
  }

  async run(
    idempotencyKey: string,
    referenceTime = new Date(),
    timeoutMs = 300_000,
  ) {
    const claim = await this.claimRun(idempotencyKey, referenceTime, timeoutMs);
    const lifecycleRun = claim.run;
    if (!claim.execute) return lifecycleRun;

    const deadline = Date.now() + lifecycleRun.timeoutMs;
    const counts: LifecycleCounts = {
      agentConversationsPurged: 0,
      contentSnapshotsPurged: 0,
      heldRecordsSkipped: 0,
      modelResponsesPurged: 0,
      privateFileFailures: 0,
    };
    const cutoff = new Date(lifecycleRun.cutoffAt.getTime() - retentionMs);
    try {
      const holds = await this.activeHoldKeys();
      await this.purgeModelResponses(cutoff, holds, counts, deadline);
      await this.purgeContentSnapshots(cutoff, holds, counts, deadline);
      await this.purgeAgentConversations(cutoff, holds, counts, deadline);
      if (counts.privateFileFailures > 0)
        throw new DataLifecycleError(
          "PRIVATE_FILE_PURGE_FAILED",
          "One or more private files could not be removed.",
        );
      return await this.finishRun(lifecycleRun.id, counts);
    } catch (error) {
      await this.failRun(lifecycleRun.id, counts, error);
      throw error;
    }
  }

  private async claimRun(
    idempotencyKey: string,
    cutoffAt: Date,
    timeoutMs: number,
  ) {
    const existing = await this.database.dataLifecycleRun.findUnique({
      where: { idempotencyKey },
    });
    if (!existing) {
      try {
        return {
          execute: true,
          run: await this.database.dataLifecycleRun.create({
            data: {
              counts: {},
              cutoffAt,
              id: uuidv7(),
              idempotencyKey,
              timeoutMs,
            },
          }),
        };
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        )
          throw error;
        return {
          execute: false,
          run: await this.database.dataLifecycleRun.findUniqueOrThrow({
            where: { idempotencyKey },
          }),
        };
      }
    }
    if (
      existing.status === DataLifecycleRunStatus.completed ||
      existing.status === DataLifecycleRunStatus.dead_letter
    )
      return { execute: false, run: existing };
    if (existing.status === DataLifecycleRunStatus.running) {
      const staleBefore = Date.now() - existing.timeoutMs;
      if (existing.updatedAt.getTime() >= staleBefore)
        return { execute: false, run: existing };
    }
    if (existing.attempts >= existing.maxAttempts)
      return {
        execute: false,
        run: await this.database.dataLifecycleRun.update({
          data: { status: DataLifecycleRunStatus.dead_letter },
          where: { id: existing.id },
        }),
      };
    const claimed = await this.database.dataLifecycleRun.updateMany({
      data: {
        attempts: { increment: 1 },
        errorCode: null,
        startedAt: new Date(),
        status: DataLifecycleRunStatus.running,
      },
      where: {
        attempts: existing.attempts,
        id: existing.id,
        status: existing.status,
        updatedAt: existing.updatedAt,
      },
    });
    return {
      execute: claimed.count === 1,
      run: await this.database.dataLifecycleRun.findUniqueOrThrow({
        where: { id: existing.id },
      }),
    };
  }

  private async activeHoldKeys() {
    const holds = await this.database.legalHold.findMany({
      select: { scopeId: true, scopeType: true },
      where: { active: true },
    });
    return new Set(holds.map((hold) => `${hold.scopeType}:${hold.scopeId}`));
  }

  private async purgeModelResponses(
    cutoff: Date,
    holds: ReadonlySet<string>,
    counts: LifecycleCounts,
    deadline: number,
  ) {
    const results = await this.database.modelRunResult.findMany({
      include: {
        modelRun: {
          select: {
            analysisJob: { select: { projectId: true, workspaceId: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: maxRecordsPerCategory,
      where: { createdAt: { lt: cutoff }, responsePurgedAt: null },
    });
    for (const result of results) {
      this.assertBeforeDeadline(deadline);
      const scope = result.modelRun.analysisJob;
      if (isScopeHeld(holds, scope.workspaceId, scope.projectId)) {
        counts.heldRecordsSkipped += 1;
        continue;
      }
      await this.database.modelRunResult.update({
        data: { citations: [], responsePurgedAt: new Date(), responseText: "" },
        where: { id: result.id },
      });
      counts.modelResponsesPurged += 1;
    }
  }

  private async purgeContentSnapshots(
    cutoff: Date,
    holds: ReadonlySet<string>,
    counts: LifecycleCounts,
    deadline: number,
  ) {
    const snapshots = await this.database.contentSnapshot.findMany({
      include: {
        source: {
          select: { project: { select: { id: true, workspaceId: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      take: maxRecordsPerCategory,
      where: { contentPurgedAt: null, fetchedAt: { lt: cutoff } },
    });
    for (const snapshot of snapshots) {
      this.assertBeforeDeadline(deadline);
      const scope = snapshot.source.project;
      if (isScopeHeld(holds, scope.workspaceId, scope.id)) {
        counts.heldRecordsSkipped += 1;
        continue;
      }
      if (snapshot.textStoragePath) {
        try {
          await removePrivateFile(
            this.privateFileRoot,
            snapshot.textStoragePath,
          );
        } catch {
          counts.privateFileFailures += 1;
          continue;
        }
      }
      await this.database.contentSnapshot.update({
        data: {
          contentPurgedAt: new Date(),
          diffSummary: Prisma.DbNull,
          extractedText: null,
          structuredData: Prisma.DbNull,
          summary: null,
          textStoragePath: null,
        },
        where: { id: snapshot.id },
      });
      counts.contentSnapshotsPurged += 1;
    }
  }

  private async purgeAgentConversations(
    cutoff: Date,
    holds: ReadonlySet<string>,
    counts: LifecycleCounts,
    deadline: number,
  ) {
    const runs = await this.database.agentRun.findMany({
      orderBy: { createdAt: "asc" },
      take: maxRecordsPerCategory,
      where: { conversationPurgedAt: null, createdAt: { lt: cutoff } },
    });
    for (const run of runs) {
      this.assertBeforeDeadline(deadline);
      if (isScopeHeld(holds, run.workspaceId, run.projectId)) {
        counts.heldRecordsSkipped += 1;
        continue;
      }
      await this.database.$transaction([
        this.database.agentAction.updateMany({
          data: { inputSnapshot: {}, outputSnapshot: Prisma.DbNull },
          where: { agentRunId: run.id },
        }),
        this.database.agentRun.update({
          data: {
            answer: null,
            citations: [],
            contextSnapshot: {},
            conversationPurgedAt: new Date(),
            question: "[purged]",
          },
          where: { id: run.id },
        }),
      ]);
      counts.agentConversationsPurged += 1;
    }
  }

  private async finishRun(runId: string, counts: LifecycleCounts) {
    return this.database.$transaction(async (transaction) => {
      const run = await transaction.dataLifecycleRun.update({
        data: {
          completedAt: new Date(),
          counts: counts as unknown as Prisma.InputJsonValue,
          errorCode: null,
          status: DataLifecycleRunStatus.completed,
        },
        where: { id: runId },
      });
      await this.systemAudit(transaction, runId, AuditOutcome.success, counts);
      return run;
    });
  }

  private async failRun(
    runId: string,
    counts: LifecycleCounts,
    error: unknown,
  ) {
    const current = await this.database.dataLifecycleRun.findUniqueOrThrow({
      where: { id: runId },
    });
    const status =
      current.attempts >= current.maxAttempts
        ? DataLifecycleRunStatus.dead_letter
        : DataLifecycleRunStatus.failed;
    const errorCode =
      error instanceof DataLifecycleError
        ? error.code
        : "DATA_LIFECYCLE_RUN_FAILED";
    await this.database.$transaction(async (transaction) => {
      await transaction.dataLifecycleRun.update({
        data: {
          counts: counts as unknown as Prisma.InputJsonValue,
          errorCode,
          status,
        },
        where: { id: runId },
      });
      await this.systemAudit(transaction, runId, AuditOutcome.failure, {
        ...counts,
        errorCode,
        status,
      });
    });
  }

  private assertBeforeDeadline(deadline: number) {
    if (Date.now() > deadline)
      throw new DataLifecycleError(
        "DATA_LIFECYCLE_TIMEOUT",
        "Data lifecycle run exceeded its timeout.",
      );
  }

  private async assertScopeExists(
    scopeType: LegalHoldScopeType,
    scopeId: string,
  ) {
    const exists =
      scopeType === LegalHoldScopeType.workspace
        ? await this.database.workspace.findUnique({ where: { id: scopeId } })
        : await this.database.project.findUnique({ where: { id: scopeId } });
    if (!exists)
      throw new DataLifecycleError(
        "LEGAL_HOLD_SCOPE_NOT_FOUND",
        "Legal hold scope was not found.",
      );
  }

  private async requireAdmin(actor: LegalHoldActor, sensitive: boolean) {
    if (
      actor.audience !== AuthAudience.admin ||
      !(await this.database.platformRoleAssignment.findFirst({
        where: { role: { code: "super_admin" }, userId: actor.userId },
      }))
    )
      throw new DataLifecycleError(
        "FORBIDDEN",
        "Admin permission is required.",
      );
    if (
      sensitive &&
      (!actor.stepUpUntil || actor.stepUpUntil.getTime() <= Date.now())
    )
      throw new DataLifecycleError(
        "AUTH_STEP_UP_REQUIRED",
        "Recent step-up authentication is required.",
      );
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    actor: LegalHoldActor,
    action: string,
    objectType: string,
    objectId: string,
    afterSummary: object,
  ) {
    const context = getRequestContext();
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: actor.email.replace(/(.{2}).+(@.*)/u, "$1***$2"),
        actorId: actor.userId,
        actorType: "user",
        afterSummary,
        id: uuidv7(),
        objectId,
        objectType,
        outcome: AuditOutcome.success,
        requestId: context?.requestId ?? uuidv7(),
        riskLevel: "high",
        traceId: context?.traceId ?? "00000000000000000000000000000000",
      },
    });
  }

  private async systemAudit(
    transaction: Prisma.TransactionClient,
    objectId: string,
    outcome: AuditOutcome,
    afterSummary: object,
  ) {
    const context = getRequestContext();
    await transaction.auditLog.create({
      data: {
        action: "data_lifecycle.run",
        actorType: "system",
        afterSummary,
        id: uuidv7(),
        objectId,
        objectType: "DataLifecycleRun",
        outcome,
        requestId: context?.requestId ?? uuidv7(),
        riskLevel: "high",
        traceId: context?.traceId ?? "00000000000000000000000000000000",
      },
    });
  }
}

export function isScopeHeld(
  holds: ReadonlySet<string>,
  workspaceId?: string | null,
  projectId?: string | null,
) {
  return Boolean(
    (workspaceId &&
      holds.has(`${LegalHoldScopeType.workspace}:${workspaceId}`)) ||
    (projectId && holds.has(`${LegalHoldScopeType.project}:${projectId}`)),
  );
}

export function resolvePrivateFilePath(root: string, storedPath: string) {
  const absoluteRoot = resolve(root);
  const candidate = isAbsolute(storedPath)
    ? resolve(storedPath)
    : resolve(absoluteRoot, storedPath);
  const fromRoot = relative(absoluteRoot, candidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot))
    throw new DataLifecycleError(
      "PRIVATE_FILE_PATH_INVALID",
      "Private file path is outside the configured root.",
    );
  return candidate;
}

async function removePrivateFile(root: string, storedPath: string) {
  const path = resolvePrivateFilePath(root, storedPath);
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
