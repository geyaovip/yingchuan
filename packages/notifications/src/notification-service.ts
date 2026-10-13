import {
  AuditOutcome,
  AuthAudience,
  NotificationDeliveryStatus,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import type { EncryptedSecret, SecretBox } from "@yingchuan/model-gateway";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import type { TelegramAdapter } from "./telegram-adapter.js";

export interface NotificationActor {
  readonly audience: AuthAudience;
  readonly email: string;
  readonly stepUpUntil?: Date | null;
  readonly userId: string;
}

export interface SiteNoticeInput {
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

export class NotificationApplicationService {
  /** The caller supplies the validated recipient and transaction for atomic domain writes. */
  static async createSiteNotice(
    transaction: Prisma.TransactionClient,
    input: SiteNoticeInput,
  ): Promise<void> {
    await transaction.notification.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: { ...input, id: uuidv7() },
    });
  }

  constructor(
    private readonly database: PrismaClient,
    private readonly secretBox: SecretBox,
    private readonly telegram: TelegramAdapter,
  ) {}

  async consumeReportReady(eventId: string): Promise<boolean> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "report.ready") return false;
    const payload = event.payload as {
      projectId?: unknown;
      reportVersionId?: unknown;
    };
    if (
      typeof payload.projectId !== "string" ||
      typeof payload.reportVersionId !== "string"
    )
      return false;
    const projectId = payload.projectId;
    const reportVersionId = payload.reportVersionId;
    await this.database.$transaction(async (transaction) => {
      if (
        await transaction.inboxReceipt.findUnique({
          where: {
            consumer_eventId: {
              consumer: "notification-report-ready",
              eventId,
            },
          },
        })
      )
        return;
      const project = await transaction.project.findUnique({
        where: { id: projectId },
      });
      if (!project) return;
      const memberships = await transaction.workspaceMembership.findMany({
        select: { userId: true },
        where: { status: "active", workspaceId: project.workspaceId },
      });
      for (const membership of memberships)
        await transaction.notification.upsert({
          create: {
            body: `${project.name} 的新分析报告已经生成。`,
            href: `/projects/${project.id}/reports`,
            id: uuidv7(),
            idempotencyKey: `report.ready/${reportVersionId}/${membership.userId}`,
            objectId: reportVersionId,
            objectType: "ReportVersion",
            title: "报告已就绪",
            type: "report.ready",
            userId: membership.userId,
            workspaceId: project.workspaceId,
          },
          update: {},
          where: {
            idempotencyKey: `report.ready/${reportVersionId}/${membership.userId}`,
          },
        });
      await transaction.inboxReceipt.create({
        data: { consumer: "notification-report-ready", eventId, id: uuidv7() },
      });
    });
    return true;
  }

  async list(userId: string) {
    return this.database.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { userId },
    });
  }
  async markRead(notificationId: string, userId: string) {
    const updated = await this.database.notification.updateMany({
      data: { readAt: new Date() },
      where: { id: notificationId, userId },
    });
    if (updated.count !== 1) throw new Error("RESOURCE_NOT_FOUND");
    return this.database.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
  }

  async getAdminConfig(actor: NotificationActor) {
    await this.requireAdmin(actor);
    const config = await this.database.notificationChannelConfig.findUnique({
      where: { code: "telegram" },
    });
    return config
      ? this.publicConfig(config)
      : { code: "telegram", configured: false, enabled: false, version: 0 };
  }

  async saveTelegram(
    input: { chatId: string; enabled: boolean; token: string },
    actor: NotificationActor,
  ) {
    await this.requireAdmin(actor, true);
    const encryptedToken = this.secretBox.encrypt(input.token.trim());
    const encryptedChatId = this.secretBox.encrypt(input.chatId.trim());
    const config = await this.database.$transaction(async (transaction) => {
      const saved = await transaction.notificationChannelConfig.upsert({
        create: {
          code: "telegram",
          enabled: input.enabled,
          encryptedChatId: JSON.stringify(encryptedChatId),
          encryptedToken: JSON.stringify(encryptedToken),
          encryptionKeyVersion: encryptedToken.keyVersion,
          id: uuidv7(),
          maskedChatIdHint: mask(input.chatId),
          maskedTokenHint: mask(input.token),
          updatedById: actor.userId,
        },
        update: {
          enabled: input.enabled,
          encryptedChatId: JSON.stringify(encryptedChatId),
          encryptedToken: JSON.stringify(encryptedToken),
          encryptionKeyVersion: encryptedToken.keyVersion,
          lastErrorCode: null,
          maskedChatIdHint: mask(input.chatId),
          maskedTokenHint: mask(input.token),
          updatedById: actor.userId,
          version: { increment: 1 },
        },
        where: { code: "telegram" },
      });
      await this.audit(
        transaction,
        actor,
        "notification.telegram.configure",
        saved.id,
        "medium",
      );
      return saved;
    });
    return this.publicConfig(config);
  }

  async testTelegram(idempotencyKey: string, actor: NotificationActor) {
    await this.requireAdmin(actor, true);
    if (!idempotencyKey || idempotencyKey.length < 8)
      throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const existing = await this.database.notificationDelivery.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;
    const recent = await this.database.notificationDelivery.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 60_000) },
        payload: { path: ["kind"], equals: "telegram_test" },
      },
    });
    if (recent >= 3) throw new Error("RATE_LIMITED");
    const config = await this.database.notificationChannelConfig.findUnique({
      where: { code: "telegram" },
    });
    if (!config?.encryptedToken || !config.encryptedChatId)
      throw new Error("TELEGRAM_NOT_CONFIGURED");
    const delivery = await this.database.notificationDelivery.create({
      data: {
        attempts: 1,
        channelConfigId: config.id,
        id: uuidv7(),
        idempotencyKey,
        payload: { kind: "telegram_test", text: "映川 Telegram 测试消息" },
        status: NotificationDeliveryStatus.sending,
      },
    });
    try {
      const decrypted = this.secretBox.decrypt(
        JSON.parse(config.encryptedToken) as EncryptedSecret,
      );
      const sent = await this.telegram.send({
        chatId: this.secretBox.decrypt(
          JSON.parse(config.encryptedChatId) as EncryptedSecret,
        ),
        text: "映川 Telegram 测试消息：渠道配置可用。",
        token: decrypted,
      });
      const result = await this.database.$transaction(async (transaction) => {
        const updated = await transaction.notificationDelivery.update({
          data: {
            providerMessageId: sent.messageId,
            sentAt: new Date(),
            status: NotificationDeliveryStatus.sent,
          },
          where: { id: delivery.id },
        });
        await transaction.notificationChannelConfig.update({
          data: {
            lastErrorCode: null,
            lastSuccessAt: new Date(),
            lastTestedAt: new Date(),
          },
          where: { id: config.id },
        });
        await this.audit(
          transaction,
          actor,
          "notification.telegram.test",
          delivery.id,
          "low",
        );
        return updated;
      });
      return result;
    } catch (error) {
      const code = safeError(error);
      await this.database.notificationDelivery.update({
        data: { errorCode: code, status: NotificationDeliveryStatus.failed },
        where: { id: delivery.id },
      });
      await this.database.notificationChannelConfig.update({
        data: { lastErrorCode: code, lastTestedAt: new Date() },
        where: { id: config.id },
      });
      throw new Error(code, { cause: error });
    }
  }

  async deliveries(actor: NotificationActor) {
    await this.requireAdmin(actor);
    return this.database.notificationDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        attempts: true,
        createdAt: true,
        errorCode: true,
        id: true,
        idempotencyKey: true,
        providerMessageId: true,
        sentAt: true,
        status: true,
      },
    });
  }
  private async requireAdmin(actor: NotificationActor, stepUp = false) {
    if (
      actor.audience !== AuthAudience.admin ||
      !(await this.database.platformRoleAssignment.findFirst({
        where: { role: { code: "super_admin" }, userId: actor.userId },
      }))
    )
      throw new Error("FORBIDDEN");
    if (
      stepUp &&
      (!actor.stepUpUntil || actor.stepUpUntil.getTime() <= Date.now())
    )
      throw new Error("AUTH_STEP_UP_REQUIRED");
  }
  private publicConfig(config: {
    code: string;
    enabled: boolean;
    lastErrorCode: string | null;
    lastSuccessAt: Date | null;
    lastTestedAt: Date | null;
    maskedChatIdHint: string | null;
    maskedTokenHint: string | null;
    version: number;
  }) {
    return {
      chatIdHint: config.maskedChatIdHint,
      code: config.code,
      configured: Boolean(config.maskedTokenHint && config.maskedChatIdHint),
      enabled: config.enabled,
      lastErrorCode: config.lastErrorCode,
      lastSuccessAt: config.lastSuccessAt,
      lastTestedAt: config.lastTestedAt,
      tokenHint: config.maskedTokenHint,
      version: config.version,
    };
  }
  private async audit(
    transaction: Prisma.TransactionClient,
    actor: NotificationActor,
    action: string,
    objectId: string,
    riskLevel: string,
  ) {
    const context = getRequestContext();
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: mask(actor.email),
        actorId: actor.userId,
        actorType: "user",
        id: uuidv7(),
        objectId,
        objectType: action.includes("test")
          ? "NotificationDelivery"
          : "NotificationChannelConfig",
        outcome: AuditOutcome.success,
        requestId: context?.requestId ?? uuidv7(),
        riskLevel,
        traceId: context?.traceId ?? "00000000000000000000000000000000",
      },
    });
  }
}

function mask(value: string) {
  const clean = value.trim();
  return clean.length <= 4
    ? "****"
    : `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}
function safeError(error: unknown) {
  const code =
    error instanceof Error ? error.message : "TELEGRAM_DELIVERY_FAILED";
  return [
    "TELEGRAM_AUTH_FAILED",
    "TELEGRAM_DELIVERY_FAILED",
    "TELEGRAM_RESPONSE_INVALID",
  ].includes(code)
    ? code
    : "TELEGRAM_DELIVERY_FAILED";
}
