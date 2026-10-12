import { HttpException, Injectable } from "@nestjs/common";
import {
  AuditOutcome,
  AuthAudience,
  UsageEntryType,
  UserStatus,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import type { AuthenticatedSession } from "../auth/auth.types.js";

@Injectable()
export class AdminService {
  constructor(private readonly database: PrismaClient) {}

  async dashboard(auth: AuthenticatedSession) {
    await this.requireAdmin(auth);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      users,
      workspaces,
      projects,
      jobs,
      failedJobs,
      calls,
      failedCalls,
      pendingOutbox,
    ] = await Promise.all([
      this.database.user.count(),
      this.database.workspace.count(),
      this.database.project.count(),
      this.database.analysisJob.count({ where: { createdAt: { gte: since } } }),
      this.database.analysisJob.count({
        where: {
          createdAt: { gte: since },
          status: { in: ["failed", "partially_completed"] },
        },
      }),
      this.database.modelCallLog.count({
        where: { createdAt: { gte: since } },
      }),
      this.database.modelCallLog.count({
        where: { createdAt: { gte: since }, status: "failed" },
      }),
      this.database.outboxEvent.count({
        where: { status: { in: ["pending", "dead_letter"] } },
      }),
    ]);
    return {
      dataFrom: since,
      dataTo: new Date(),
      failedCalls,
      failedJobs,
      jobs,
      modelCalls: calls,
      pendingOutbox,
      projects,
      users,
      workspaces,
    };
  }

  async users(auth: AuthenticatedSession, query?: string) {
    await this.requireAdmin(auth);
    return this.database.user.findMany({
      include: {
        memberships: {
          include: {
            role: true,
            workspace: {
              include: {
                _count: { select: { projects: true } },
                usageLedgerEntries: { select: { quantityMicros: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: query
        ? {
            OR: [
              { displayEmail: { contains: query, mode: "insensitive" } },
              { emailNormalized: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
    });
  }

  async projects(auth: AuthenticatedSession, query?: string) {
    await this.requireAdmin(auth);
    return this.database.project.findMany({
      include: {
        analysisJobs: { orderBy: { createdAt: "desc" }, take: 1 },
        brandEntity: true,
        workspace: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: query
        ? { name: { contains: query, mode: "insensitive" } }
        : undefined,
    });
  }

  async tasks(auth: AuthenticatedSession, status?: string) {
    await this.requireAdmin(auth);
    const allowed = [
      "queued",
      "running",
      "completed",
      "partially_completed",
      "failed",
      "cancelled",
    ] as const;
    return this.database.analysisJob.findMany({
      include: {
        project: { select: { id: true, name: true } },
        runs: {
          include: {
            attempts: true,
            modelConfigVersion: { include: { modelConfig: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: allowed.includes(status as (typeof allowed)[number])
        ? { status: status as (typeof allowed)[number] }
        : undefined,
    });
  }

  async setUserStatus(
    auth: AuthenticatedSession,
    userId: string,
    status: UserStatus,
  ) {
    await this.requireAdmin(auth);
    if (userId === auth.user.id && status === UserStatus.suspended)
      throw new HttpException(
        {
          error: {
            code: "SELF_SUSPEND_FORBIDDEN",
            message: "不能停用当前管理员账号。",
          },
        },
        409,
      );
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.user.findUnique({
        where: { id: userId },
      });
      if (!before)
        throw new HttpException(
          { error: { code: "RESOURCE_NOT_FOUND", message: "用户不存在。" } },
          404,
        );
      const updated = await transaction.user.update({
        data: { status },
        where: { id: userId },
      });
      await this.audit(
        transaction,
        auth,
        "admin.user.status.update",
        "User",
        userId,
        "medium",
        { status: before.status },
        { status },
      );
      if (status === UserStatus.suspended)
        await transaction.authSession.updateMany({
          data: { revokedAt: new Date() },
          where: { userId, revokedAt: null },
        });
      return updated;
    });
  }

  async adjustQuota(
    auth: AuthenticatedSession,
    workspaceId: string,
    quantityMicros: bigint,
    reason: string,
  ) {
    await this.requireAdmin(auth);
    if (
      quantityMicros === 0n ||
      quantityMicros > 1_000_000_000_000n ||
      quantityMicros < -1_000_000_000_000n
    )
      throw new HttpException(
        { error: { code: "VALIDATION_FAILED", message: "额度调整值无效。" } },
        400,
      );
    return this.database.$transaction(async (transaction) => {
      if (
        !(await transaction.workspace.findUnique({
          where: { id: workspaceId },
        }))
      )
        throw new HttpException(
          { error: { code: "RESOURCE_NOT_FOUND", message: "工作区不存在。" } },
          404,
        );
      const entry = await transaction.usageLedgerEntry.create({
        data: {
          currency: "CNY",
          entryType: UsageEntryType.adjustment,
          id: uuidv7(),
          idempotencyKey: `admin-adjustment/${uuidv7()}`,
          quantityMicros,
          resourceType: "model_cost",
          source: `admin:${reason.trim()}`,
          userId: auth.user.id,
          workspaceId,
        },
      });
      await this.audit(
        transaction,
        auth,
        "admin.usage.adjust",
        "Workspace",
        workspaceId,
        "medium",
        undefined,
        { quantityMicros: quantityMicros.toString(), reason },
      );
      return {
        ...entry,
        quantityMicros: entry.quantityMicros.toString(),
        unitCostMicros: entry.unitCostMicros.toString(),
      };
    });
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
    transaction: Prisma.TransactionClient,
    auth: AuthenticatedSession,
    action: string,
    objectType: string,
    objectId: string,
    riskLevel: string,
    beforeSummary?: object,
    afterSummary?: object,
  ) {
    const context = getRequestContext();
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: auth.user.displayEmail.replace(
          /(.{2}).+(@.*)/u,
          "$1***$2",
        ),
        actorId: auth.user.id,
        actorType: "user",
        afterSummary,
        beforeSummary,
        id: uuidv7(),
        objectId,
        objectType,
        outcome: AuditOutcome.success,
        requestId: context?.requestId ?? uuidv7(),
        riskLevel,
        traceId: context?.traceId ?? "00000000000000000000000000000000",
      },
    });
  }
}
