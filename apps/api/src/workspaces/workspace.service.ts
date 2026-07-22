import { createHmac, randomBytes } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  AuditOutcome,
  MembershipStatus,
  RoleScope,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { v7 as uuidv7 } from "uuid";

import { DATABASE_CLIENT } from "../database/database.constants.js";
import { EMAIL_SENDER } from "../auth/auth.constants.js";
import type { EmailSender } from "../auth/email-sender.js";
import type {
  AuthenticatedSession,
  RequestIdentity,
} from "../auth/auth.types.js";

@Injectable()
export class WorkspaceService {
  private readonly pepper = getRuntimeValue("AUTH_PEPPER", {
    fallback: "yingchuan_local_auth_pepper_change_before_production",
  });

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async create(
    name: string,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ) {
    const ownerRole = await this.role("owner");
    const id = uuidv7();
    const slug = `${this.slugify(name)}-${id.slice(-8)}`;
    return this.database.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({
        data: { createdById: auth.user.id, id, name, slug },
      });
      await transaction.workspaceMembership.create({
        data: {
          id: uuidv7(),
          roleId: ownerRole.id,
          userId: auth.user.id,
          workspaceId: workspace.id,
        },
      });
      await this.audit(
        transaction,
        auth,
        identity,
        "workspace.create",
        workspace.id,
        workspace.id,
      );
      return workspace;
    });
  }

  async list(auth: AuthenticatedSession) {
    return this.database.workspace.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        id: true,
        name: true,
        slug: true,
        updatedAt: true,
        version: true,
        memberships: {
          select: { role: { select: { code: true } } },
          where: { status: MembershipStatus.active, userId: auth.user.id },
        },
      },
      where: {
        memberships: {
          some: { status: MembershipStatus.active, userId: auth.user.id },
        },
      },
    });
  }

  async get(workspaceId: string, auth: AuthenticatedSession) {
    await this.membership(workspaceId, auth.user.id);
    return this.database.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
  }

  async update(
    workspaceId: string,
    name: string,
    version: number,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ) {
    await this.requirePermission(
      workspaceId,
      auth.user.id,
      "workspace.settings.manage",
    );
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.workspace.updateMany({
        data: { name, version: { increment: 1 } },
        where: { id: workspaceId, version },
      });
      if (result.count !== 1) throw this.conflict();
      await this.audit(
        transaction,
        auth,
        identity,
        "workspace.update",
        workspaceId,
        workspaceId,
      );
      return transaction.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
    });
  }

  async listMembers(workspaceId: string, auth: AuthenticatedSession) {
    await this.membership(workspaceId, auth.user.id);
    return this.database.workspaceMembership.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        id: true,
        role: { select: { code: true } },
        status: true,
        user: { select: { displayEmail: true, id: true } },
        version: true,
      },
      where: { status: MembershipStatus.active, workspaceId },
    });
  }

  async invite(
    workspaceId: string,
    emailInput: string,
    roleCode: string,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ) {
    await this.requirePermission(workspaceId, auth.user.id, "member.manage");
    const workspace = await this.database.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) throw this.notFound();
    const role = await this.role(roleCode);
    const email = emailInput.trim().toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const invitationId = uuidv7();
    try {
      await this.emailSender.sendWorkspaceInvitation({
        email,
        idempotencyKey: `workspace-invitation/${invitationId}`,
        token,
        workspaceName: workspace.name,
      });
    } catch {
      throw new HttpException(
        {
          error: {
            code: "EXTERNAL_DEPENDENCY_UNAVAILABLE",
            message: "邀请邮件暂时无法发送，请稍后重试。",
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.database.$transaction(async (transaction) => {
      const invitation = await transaction.workspaceInvitation.create({
        data: {
          createdById: auth.user.id,
          emailNormalized: email,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          id: invitationId,
          roleId: role.id,
          tokenHash: this.hash(token),
          workspaceId,
        },
        select: {
          createdAt: true,
          emailNormalized: true,
          expiresAt: true,
          id: true,
          status: true,
        },
      });
      await this.audit(
        transaction,
        auth,
        identity,
        "workspace.invitation.create",
        workspaceId,
        invitation.id,
      );
      return invitation;
    });
  }

  async listInvitations(workspaceId: string, auth: AuthenticatedSession) {
    await this.requirePermission(workspaceId, auth.user.id, "member.manage");
    return this.database.workspaceInvitation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        emailNormalized: true,
        expiresAt: true,
        id: true,
        role: { select: { code: true } },
        status: true,
      },
      where: { workspaceId },
    });
  }

  async acceptInvitation(
    token: string,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ) {
    const invitation = await this.database.workspaceInvitation.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (
      !invitation ||
      invitation.status !== MembershipStatus.invited ||
      invitation.expiresAt.getTime() <= Date.now() ||
      invitation.emailNormalized !== auth.user.emailNormalized
    ) {
      throw this.notFound();
    }
    return this.database.$transaction(async (transaction) => {
      const claimed = await transaction.workspaceInvitation.updateMany({
        data: { acceptedAt: new Date(), status: MembershipStatus.active },
        where: { id: invitation.id, status: MembershipStatus.invited },
      });
      if (claimed.count !== 1) throw this.conflict();
      const membership = await transaction.workspaceMembership.upsert({
        create: {
          id: uuidv7(),
          roleId: invitation.roleId,
          userId: auth.user.id,
          workspaceId: invitation.workspaceId,
        },
        update: {
          roleId: invitation.roleId,
          status: MembershipStatus.active,
          version: { increment: 1 },
        },
        where: {
          workspaceId_userId: {
            userId: auth.user.id,
            workspaceId: invitation.workspaceId,
          },
        },
      });
      await this.audit(
        transaction,
        auth,
        identity,
        "workspace.invitation.accept",
        invitation.workspaceId,
        invitation.id,
      );
      return membership;
    });
  }

  async changeMemberRole(
    workspaceId: string,
    memberId: string,
    roleCode: string,
    version: number,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ) {
    const role = await this.role(roleCode);
    return this.database.$transaction(async (transaction) => {
      await this.lockWorkspace(transaction, workspaceId);
      const actor = await this.transactionMembership(
        transaction,
        workspaceId,
        auth.user.id,
      );
      if (
        !actor.role.rolePermissions.some(
          (item) => item.permission.code === "member.manage",
        )
      ) {
        throw this.forbidden();
      }
      const target = await transaction.workspaceMembership.findFirst({
        include: { role: true },
        where: { id: memberId, status: MembershipStatus.active, workspaceId },
      });
      if (!target) throw this.notFound();
      if (
        actor.role.code !== "owner" &&
        (target.role.code === "owner" || roleCode === "owner")
      ) {
        throw this.forbidden();
      }
      if (target.role.code === "owner" && roleCode !== "owner") {
        await this.assertAnotherOwner(transaction, workspaceId, target.id);
      }
      const changed = await transaction.workspaceMembership.updateMany({
        data: { roleId: role.id, version: { increment: 1 } },
        where: { id: memberId, version, workspaceId },
      });
      if (changed.count !== 1) throw this.conflict();
      await this.audit(
        transaction,
        auth,
        identity,
        "workspace.member.role_change",
        workspaceId,
        memberId,
      );
      return transaction.workspaceMembership.findUniqueOrThrow({
        include: {
          role: { select: { code: true } },
          user: { select: { displayEmail: true, id: true } },
        },
        where: { id: memberId },
      });
    });
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.lockWorkspace(transaction, workspaceId);
      const actor = await this.transactionMembership(
        transaction,
        workspaceId,
        auth.user.id,
      );
      if (
        !actor.role.rolePermissions.some(
          (item) => item.permission.code === "member.manage",
        )
      ) {
        throw this.forbidden();
      }
      const target = await transaction.workspaceMembership.findFirst({
        include: { role: true },
        where: { id: memberId, status: MembershipStatus.active, workspaceId },
      });
      if (!target) throw this.notFound();
      if (actor.role.code !== "owner" && target.role.code === "owner") {
        throw this.forbidden();
      }
      if (target.role.code === "owner") {
        await this.assertAnotherOwner(transaction, workspaceId, target.id);
      }
      await transaction.workspaceMembership.update({
        data: { status: MembershipStatus.removed, version: { increment: 1 } },
        where: { id: target.id },
      });
      await this.audit(
        transaction,
        auth,
        identity,
        "workspace.member.remove",
        workspaceId,
        memberId,
      );
    });
  }

  private async membership(workspaceId: string, userId: string) {
    const membership = await this.database.workspaceMembership.findFirst({
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
      where: { status: MembershipStatus.active, userId, workspaceId },
    });
    if (!membership) throw this.notFound();
    return membership;
  }

  private async requirePermission(
    workspaceId: string,
    userId: string,
    code: string,
  ) {
    const membership = await this.membership(workspaceId, userId);
    if (
      !membership.role.rolePermissions.some(
        (item) => item.permission.code === code,
      )
    ) {
      throw this.forbidden();
    }
    return membership;
  }

  private async assertAnotherOwner(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    excludedMemberId: string,
  ): Promise<void> {
    const count = await transaction.workspaceMembership.count({
      where: {
        id: { not: excludedMemberId },
        role: { code: "owner", scope: RoleScope.workspace },
        status: MembershipStatus.active,
        workspaceId,
      },
    });
    if (count === 0) {
      throw new HttpException(
        {
          error: {
            code: "LAST_OWNER_REQUIRED",
            message: "必须保留至少一名工作区所有者。",
          },
        },
        HttpStatus.CONFLICT,
      );
    }
  }

  private async lockWorkspace(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ acquired: number }>>`
      SELECT 1 AS acquired
      WHERE pg_advisory_xact_lock(hashtext(${workspaceId})) IS NULL
    `;
  }

  private async transactionMembership(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
  ) {
    const membership = await transaction.workspaceMembership.findFirst({
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
      where: { status: MembershipStatus.active, userId, workspaceId },
    });
    if (!membership) throw this.notFound();
    return membership;
  }

  private async role(code: string) {
    const role = await this.database.role.findUnique({
      where: { scope_code: { code, scope: RoleScope.workspace } },
    });
    if (!role) throw new Error(`Missing workspace role: ${code}`);
    return role;
  }

  private slugify(name: string): string {
    const normalized = name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return normalized || "workspace";
  }

  private hash(value: string): string {
    return createHmac("sha256", this.pepper).update(value).digest("hex");
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    auth: AuthenticatedSession,
    identity: RequestIdentity,
    action: string,
    workspaceId: string,
    objectId: string,
  ): Promise<void> {
    const context = getRequestContext();
    await transaction.auditLog.create({
      data: {
        action,
        actorId: auth.user.id,
        actorType: "user",
        id: uuidv7(),
        ipHash: this.hash(identity.ip),
        objectId,
        objectType: action.includes("member")
          ? "WorkspaceMembership"
          : "Workspace",
        outcome: AuditOutcome.success,
        requestId: context?.requestId ?? "req_background",
        riskLevel: "medium",
        sessionId: auth.session.id,
        traceId: context?.traceId ?? "0".repeat(32),
        workspaceId,
      },
    });
  }

  private notFound(): HttpException {
    return new HttpException(
      { error: { code: "RESOURCE_NOT_FOUND", message: "资源不存在。" } },
      HttpStatus.NOT_FOUND,
    );
  }

  private forbidden(): HttpException {
    return new HttpException(
      { error: { code: "FORBIDDEN", message: "没有执行此操作的权限。" } },
      HttpStatus.FORBIDDEN,
    );
  }

  private conflict(): HttpException {
    return new HttpException(
      {
        error: {
          code: "CONCURRENT_MODIFICATION",
          message: "资源已被更新，请刷新后重试。",
        },
      },
      HttpStatus.CONFLICT,
    );
  }
}
