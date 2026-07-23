import {
  AnalysisJobStatus,
  AuditOutcome,
  AuthAudience,
  NotificationDeliveryStatus,
  OperationsDailyReportStatus,
  Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import type { EncryptedSecret, SecretBox } from "@yingchuan/model-gateway";
import { v7 as uuidv7 } from "uuid";

import type { NotificationActor } from "./notification-service.js";
import type { TelegramAdapter } from "./telegram-adapter.js";

const minute = 60_000;
const day = 24 * 60 * minute;
const reportHour = 9;
const retryMinutes = [1, 5, 15] as const;
const timezone = "Asia/Shanghai";
const timezoneOffsetMs = 8 * 60 * minute;

export interface OperationsDailyWindow {
  readonly idempotencyKey: string;
  readonly reportDate: string;
  readonly windowEnd: Date;
  readonly windowStart: Date;
}

export interface OperationsDailySnapshot {
  readonly analysisJobs: number;
  readonly analysisSuccessRate: number | null;
  readonly failedAnalysisJobs: number;
  readonly modelCostMicros: string;
  readonly newProjects: number;
  readonly newUsers: number;
  readonly paidUsers: null;
  readonly paidUsersUnavailableReason: string;
  readonly partiallyCompletedAnalysisJobs: number;
  readonly revenueMicros: null;
  readonly revenueUnavailableReason: string;
  readonly suggestions: readonly string[];
  readonly keyChanges: readonly string[];
}

export function operationsDailyWindow(
  referenceTime = new Date(),
): OperationsDailyWindow {
  const local = new Date(referenceTime.getTime() + timezoneOffsetMs);
  const daysBack = local.getUTCHours() >= reportHour ? 1 : 2;
  const reportDateUtc = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() - daysBack,
    ),
  );
  const reportDate = reportDateUtc.toISOString().slice(0, 10);
  const windowStart = new Date(reportDateUtc.getTime() - timezoneOffsetMs);
  return {
    idempotencyKey: `operations-daily/${timezone}/${reportDate}`,
    reportDate,
    windowEnd: new Date(windowStart.getTime() + day),
    windowStart,
  };
}

export class OperationsDailyReportApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly secretBox: SecretBox,
    private readonly telegram: TelegramAdapter,
  ) {}

  async list(actor: NotificationActor) {
    await this.requireAdmin(actor);
    return this.database.operationsDailyReport.findMany({
      orderBy: { reportDate: "desc" },
      take: 90,
    });
  }

  async runScheduled(referenceTime = new Date()) {
    const staleBefore = new Date(referenceTime.getTime() - 10 * minute);
    await this.database.operationsDailyReport.updateMany({
      data: {
        errorCode: "OPERATIONS_DAILY_REPORT_RETRY_EXHAUSTED",
        status: OperationsDailyReportStatus.dead_letter,
      },
      where: {
        attempts: { gte: 3 },
        status: OperationsDailyReportStatus.running,
        updatedAt: { lt: staleBefore },
      },
    });
    const retry = await this.database.operationsDailyReport.findFirst({
      orderBy: { updatedAt: "asc" },
      where: {
        attempts: { lt: 3 },
        OR: [
          { status: OperationsDailyReportStatus.failed },
          {
            status: OperationsDailyReportStatus.running,
            updatedAt: { lt: staleBefore },
          },
        ],
      },
    });
    if (retry)
      return this.run(
        {
          idempotencyKey: retry.idempotencyKey,
          reportDate: retry.reportDate.toISOString().slice(0, 10),
          windowEnd: retry.windowEnd,
          windowStart: retry.windowStart,
        },
        retry.id,
      );
    return this.run(operationsDailyWindow(referenceTime));
  }

  async processDueDeliveries(referenceTime = new Date()) {
    const due = await this.database.notificationDelivery.findMany({
      orderBy: { createdAt: "asc" },
      take: 20,
      where: {
        attempts: { lt: 4 },
        nextAttemptAt: { lte: referenceTime },
        payload: { path: ["kind"], equals: "operations_daily_report" },
        status: {
          in: [
            NotificationDeliveryStatus.queued,
            NotificationDeliveryStatus.failed,
          ],
        },
      },
    });
    let sent = 0;
    let failed = 0;
    for (const delivery of due) {
      const claim = await this.database.notificationDelivery.updateMany({
        data: {
          attempts: { increment: 1 },
          errorCode: null,
          status: NotificationDeliveryStatus.sending,
        },
        where: {
          attempts: delivery.attempts,
          id: delivery.id,
          status: delivery.status,
        },
      });
      if (claim.count !== 1) continue;
      const current =
        await this.database.notificationDelivery.findUniqueOrThrow({
          include: { channelConfig: true },
          where: { id: delivery.id },
        });
      try {
        const config = current.channelConfig;
        if (
          !config.enabled ||
          !config.encryptedToken ||
          !config.encryptedChatId
        )
          throw new Error("TELEGRAM_NOT_CONFIGURED");
        const payload = current.payload as { text?: unknown };
        if (typeof payload.text !== "string")
          throw new Error("TELEGRAM_PAYLOAD_INVALID");
        const decryptedToken = this.secretBox.decrypt(
          JSON.parse(config.encryptedToken) as EncryptedSecret,
        );
        const result = await this.telegram.send({
          chatId: this.secretBox.decrypt(
            JSON.parse(config.encryptedChatId) as EncryptedSecret,
          ),
          text: payload.text,
          token: decryptedToken,
        });
        await this.database.notificationDelivery.update({
          data: {
            nextAttemptAt: null,
            providerMessageId: result.messageId,
            sentAt: referenceTime,
            status: NotificationDeliveryStatus.sent,
          },
          where: { id: current.id },
        });
        await this.database.notificationChannelConfig.update({
          data: { lastErrorCode: null, lastSuccessAt: referenceTime },
          where: { id: current.channelConfigId },
        });
        sent += 1;
      } catch (error) {
        const exhausted = current.attempts >= current.maxAttempts;
        const delay =
          retryMinutes[
            Math.min(current.attempts - 1, retryMinutes.length - 1)
          ] ?? 15;
        const errorCode = safeDeliveryError(error);
        await this.database.notificationDelivery.update({
          data: {
            errorCode,
            nextAttemptAt: exhausted
              ? null
              : new Date(referenceTime.getTime() + delay * minute),
            status: exhausted
              ? NotificationDeliveryStatus.failed
              : NotificationDeliveryStatus.queued,
          },
          where: { id: current.id },
        });
        if (exhausted)
          await this.database.notificationChannelConfig.update({
            data: { lastErrorCode: errorCode },
            where: { id: current.channelConfigId },
          });
        failed += 1;
      }
    }
    return { failed, sent };
  }

  private async run(window: OperationsDailyWindow, retryId?: string) {
    const claim = retryId
      ? {
          execute: true,
          report: await this.database.operationsDailyReport.update({
            data: {
              attempts: { increment: 1 },
              errorCode: null,
              startedAt: new Date(),
              status: OperationsDailyReportStatus.running,
            },
            where: { id: retryId },
          }),
        }
      : await this.claim(window);
    if (!claim.execute) return claim.report;
    try {
      const snapshot = await this.collectSnapshot(window);
      const summary = renderSummary(window.reportDate, snapshot);
      return await this.database.$transaction(async (transaction) => {
        const report = await transaction.operationsDailyReport.update({
          data: {
            completedAt: new Date(),
            snapshot: snapshot as unknown as Prisma.InputJsonObject,
            status: OperationsDailyReportStatus.completed,
            summary,
          },
          where: { id: claim.report.id },
        });
        const config = await transaction.notificationChannelConfig.findUnique({
          where: { code: "telegram" },
        });
        if (config?.enabled && config.encryptedToken && config.encryptedChatId)
          await transaction.notificationDelivery.upsert({
            create: {
              channelConfigId: config.id,
              id: uuidv7(),
              idempotencyKey: `telegram/operations-daily/${report.id}`,
              maxAttempts: 4,
              nextAttemptAt: new Date(),
              payload: {
                kind: "operations_daily_report",
                reportId: report.id,
                text: summary,
              },
            },
            update: {},
            where: {
              idempotencyKey: `telegram/operations-daily/${report.id}`,
            },
          });
        await transaction.auditLog.create({
          data: {
            action: "operations_daily_report.generate",
            actorType: "system",
            afterSummary: {
              analysisJobs: snapshot.analysisJobs,
              reportDate: window.reportDate,
            },
            id: uuidv7(),
            objectId: report.id,
            objectType: "OperationsDailyReport",
            outcome: AuditOutcome.success,
            requestId: report.id,
            riskLevel: "low",
            traceId: "00000000000000000000000000000000",
          },
        });
        return report;
      });
    } catch (error) {
      const current =
        await this.database.operationsDailyReport.findUniqueOrThrow({
          where: { id: claim.report.id },
        });
      const exhausted = current.attempts >= current.maxAttempts;
      const errorCode = safeReportError(error);
      await this.database.$transaction([
        this.database.operationsDailyReport.update({
          data: {
            errorCode,
            status: exhausted
              ? OperationsDailyReportStatus.dead_letter
              : OperationsDailyReportStatus.failed,
          },
          where: { id: current.id },
        }),
        this.database.auditLog.create({
          data: {
            action: "operations_daily_report.generate",
            actorType: "system",
            errorCode,
            id: uuidv7(),
            objectId: current.id,
            objectType: "OperationsDailyReport",
            outcome: AuditOutcome.failure,
            requestId: current.id,
            riskLevel: "low",
            traceId: "00000000000000000000000000000000",
          },
        }),
      ]);
      throw error;
    }
  }

  private async claim(window: OperationsDailyWindow) {
    const existing = await this.database.operationsDailyReport.findUnique({
      where: { idempotencyKey: window.idempotencyKey },
    });
    if (existing) return { execute: false, report: existing };
    try {
      return {
        execute: true,
        report: await this.database.operationsDailyReport.create({
          data: {
            id: uuidv7(),
            idempotencyKey: window.idempotencyKey,
            reportDate: new Date(`${window.reportDate}T00:00:00.000Z`),
            timezone,
            windowEnd: window.windowEnd,
            windowStart: window.windowStart,
          },
        }),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return {
          execute: false,
          report: await this.database.operationsDailyReport.findUniqueOrThrow({
            where: { idempotencyKey: window.idempotencyKey },
          }),
        };
      throw error;
    }
  }

  private async collectSnapshot(
    window: OperationsDailyWindow,
  ): Promise<OperationsDailySnapshot> {
    const previousStart = new Date(window.windowStart.getTime() - 7 * day);
    const range = { gte: window.windowStart, lt: window.windowEnd };
    const baselineRange = { gte: previousStart, lt: window.windowStart };
    const [
      newUsers,
      newProjects,
      analysisJobs,
      completedAnalysisJobs,
      failedAnalysisJobs,
      partiallyCompletedAnalysisJobs,
      cost,
      baselineUsers,
      baselineProjects,
      baselineJobs,
      baselineCost,
    ] = await Promise.all([
      this.database.user.count({ where: { createdAt: range } }),
      this.database.project.count({ where: { createdAt: range } }),
      this.database.analysisJob.count({ where: { createdAt: range } }),
      this.database.analysisJob.count({
        where: { createdAt: range, status: AnalysisJobStatus.completed },
      }),
      this.database.analysisJob.count({
        where: { createdAt: range, status: AnalysisJobStatus.failed },
      }),
      this.database.analysisJob.count({
        where: {
          createdAt: range,
          status: AnalysisJobStatus.partially_completed,
        },
      }),
      this.database.modelCallLog.aggregate({
        _sum: { costMicros: true, webSearchCostMicros: true },
        where: { createdAt: range },
      }),
      this.database.user.count({ where: { createdAt: baselineRange } }),
      this.database.project.count({ where: { createdAt: baselineRange } }),
      this.database.analysisJob.count({
        where: { createdAt: baselineRange },
      }),
      this.database.modelCallLog.aggregate({
        _sum: { costMicros: true, webSearchCostMicros: true },
        where: { createdAt: baselineRange },
      }),
    ]);
    const modelCostMicros =
      (cost._sum.costMicros ?? 0n) + (cost._sum.webSearchCostMicros ?? 0n);
    const baselineModelCostMicros =
      (baselineCost._sum.costMicros ?? 0n) +
      (baselineCost._sum.webSearchCostMicros ?? 0n);
    const analysisSuccessRate =
      analysisJobs === 0
        ? null
        : Math.round((completedAnalysisJobs / analysisJobs) * 10_000) / 100;
    const keyChanges = [
      describeChange("新增用户", newUsers, baselineUsers / 7),
      describeChange("新增项目", newProjects, baselineProjects / 7),
      describeChange("分析任务", analysisJobs, baselineJobs / 7),
      describeCostChange(modelCostMicros, baselineModelCostMicros),
    ].filter((item): item is string => Boolean(item));
    const suggestions: string[] = [];
    if (analysisSuccessRate !== null && analysisSuccessRate < 90)
      suggestions.push("检查失败和部分完成任务，优先处理高频错误原因。");
    if (failedAnalysisJobs + partiallyCompletedAnalysisJobs > 0)
      suggestions.push("复核异常任务并确认是否需要重试或调整模型配置。");
    if (analysisJobs === 0)
      suggestions.push("昨日没有分析任务，可检查项目启用与任务触发情况。");
    if (suggestions.length === 0)
      suggestions.push("核心指标稳定，继续关注成本和任务成功率。");
    return {
      analysisJobs,
      analysisSuccessRate,
      failedAnalysisJobs,
      keyChanges:
        keyChanges.length > 0 ? keyChanges : ["主要指标与近 7 日均值接近。"],
      modelCostMicros: modelCostMicros.toString(),
      newProjects,
      newUsers,
      paidUsers: null,
      paidUsersUnavailableReason: "P0 暂无订单和付费套餐数据",
      partiallyCompletedAnalysisJobs,
      revenueMicros: null,
      revenueUnavailableReason: "P0 暂无收入账务数据",
      suggestions,
    };
  }

  private async requireAdmin(actor: NotificationActor) {
    if (
      actor.audience !== AuthAudience.admin ||
      !(await this.database.platformRoleAssignment.findFirst({
        where: { role: { code: "super_admin" }, userId: actor.userId },
      }))
    )
      throw new Error("FORBIDDEN");
  }
}

function describeChange(
  label: string,
  current: number,
  baseline: number,
): string | undefined {
  if (baseline <= 0)
    return current > 0
      ? `${label}为 ${Math.round(current)}，暂无近 7 日基线。`
      : undefined;
  const change = ((current - baseline) / baseline) * 100;
  if (Math.abs(change) < 10) return undefined;
  return `${label}较近 7 日均值${change > 0 ? "上升" : "下降"} ${Math.abs(change).toFixed(1)}%。`;
}

function describeCostChange(
  currentMicros: bigint,
  sevenDayTotalMicros: bigint,
): string | undefined {
  if (sevenDayTotalMicros <= 0n)
    return currentMicros > 0n
      ? `模型成本为 ${formatMicros(currentMicros)}，暂无近 7 日基线。`
      : undefined;
  const scaledCurrent = currentMicros * 7n;
  const changeTenths =
    ((scaledCurrent - sevenDayTotalMicros) * 1_000n) / sevenDayTotalMicros;
  if (changeTenths > -100n && changeTenths < 100n) return undefined;
  const absolute = changeTenths < 0n ? -changeTenths : changeTenths;
  return `模型成本较近 7 日均值${changeTenths > 0n ? "上升" : "下降"} ${absolute / 10n}.${absolute % 10n}%。`;
}

function renderSummary(
  reportDate: string,
  snapshot: OperationsDailySnapshot,
): string {
  const successRate =
    snapshot.analysisSuccessRate === null
      ? "无任务"
      : `${snapshot.analysisSuccessRate.toFixed(2)}%`;
  const cost = formatMicros(BigInt(snapshot.modelCostMicros));
  return [
    `[映川运营日报] ${reportDate}`,
    `新增用户：${snapshot.newUsers}`,
    `新增项目：${snapshot.newProjects}`,
    `分析任务：${snapshot.analysisJobs}`,
    `成功率：${successRate}`,
    "付费用户：暂无账务数据",
    "收入：暂无账务数据",
    `模型成本：${cost}`,
    `异常任务：${snapshot.failedAnalysisJobs + snapshot.partiallyCompletedAnalysisJobs}`,
    `重点变化：${snapshot.keyChanges.join("；")}`,
    `今日建议：${snapshot.suggestions.join("；")}`,
  ].join("\n");
}

function formatMicros(value: bigint): string {
  const yuan = value / 1_000_000n;
  const cents = ((value % 1_000_000n) / 10_000n).toString().padStart(2, "0");
  return `¥${yuan}.${cents}`;
}

function safeReportError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  return raw.startsWith("OPERATIONS_DAILY_")
    ? raw
    : "OPERATIONS_DAILY_REPORT_FAILED";
}

function safeDeliveryError(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  return [
    "TELEGRAM_AUTH_FAILED",
    "TELEGRAM_DELIVERY_FAILED",
    "TELEGRAM_NOT_CONFIGURED",
    "TELEGRAM_PAYLOAD_INVALID",
    "TELEGRAM_RESPONSE_INVALID",
  ].includes(raw)
    ? raw
    : "TELEGRAM_DELIVERY_FAILED";
}
