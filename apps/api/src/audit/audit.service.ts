import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AuthAudience, type PrismaClient } from "@yingchuan/database";

import type { AuthenticatedSession } from "../auth/auth.types.js";
import { DATABASE_CLIENT } from "../database/database.constants.js";

@Injectable()
export class AuditService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
  ) {}

  async listForAdmin(
    auth: AuthenticatedSession,
    input: {
      action?: string;
      actorId?: string;
      limit: number;
      objectType?: string;
      outcome?: string;
      requestId?: string;
      riskLevel?: string;
      workspaceId?: string;
    },
  ) {
    if (auth.session.audience !== AuthAudience.admin) throw this.forbidden();
    const platformRole = await this.database.platformRoleAssignment.findFirst({
      where: { role: { code: "super_admin" }, userId: auth.user.id },
    });
    if (!platformRole) throw this.forbidden();
    return this.database.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        action: true,
        actorEmailMask: true,
        actorId: true,
        actorType: true,
        createdAt: true,
        errorCode: true,
        id: true,
        objectId: true,
        objectType: true,
        outcome: true,
        requestId: true,
        riskLevel: true,
        traceId: true,
        workspaceId: true,
      },
      take: input.limit,
      where: {
        ...(input.action ? { action: { contains: input.action } } : {}),
        ...(input.actorId ? { actorId: input.actorId } : {}),
        ...(input.objectType ? { objectType: input.objectType } : {}),
        ...(input.outcome === "success" || input.outcome === "failure"
          ? { outcome: input.outcome }
          : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
    });
  }

  private forbidden(): HttpException {
    return new HttpException(
      { error: { code: "FORBIDDEN", message: "没有执行此操作的权限。" } },
      HttpStatus.FORBIDDEN,
    );
  }
}
