import {
  AlertEvaluationRunStatus,
  AlertStatus,
  AuditOutcome,
  AuthAudience,
  NotificationDeliveryStatus,
  Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import type { EncryptedSecret, SecretBox } from "@yingchuan/model-gateway";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import type { NotificationActor } from "./notification-service.js";
import type { TelegramAdapter } from "./telegram-adapter.js";

const minute = 60_000;
const updateIntervalMs = 30 * minute;
const retryMinutes = [1, 5, 15] as const;

export interface AlertMetricSnapshot {
  readonly hourlyCostBaselineMicros: number;
  readonly hourlyCostCurrentMicros: number;
  readonly modelCallFailures: number;
  readonly modelCallTotal: number;
  readonly queuedOverTenMinutes: number;
  readonly reportAverageLatencySeconds: number;
  readonly reportSampleCount: number;
}

export interface AlertRuleEvaluation {
  readonly body: string;
  readonly context: Record<string, number | string>;
  readonly fingerprint: string;
  readonly metricValue: number;
  readonly ruleCode: string;
  readonly severity: "warning" | "critical";
  readonly thresholdValue: number;
  readonly title: string;
  readonly triggered: boolean;
  readonly unit: string;
}

export function evaluateAlertRules(
  metrics: AlertMetricSnapshot,
): readonly AlertRuleEvaluation[] {
  const failureRate =
    metrics.modelCallTotal === 0
      ? 0
      : (metrics.modelCallFailures / metrics.modelCallTotal) * 100;
  const costIncrease =
    metrics.hourlyCostBaselineMicros <= 0
      ? 0
      : ((metrics.hourlyCostCurrentMicros - metrics.hourlyCostBaselineMicros) /
          metrics.hourlyCostBaselineMicros) *
        100;
  return [
    rule({
      body: `最近 5 分钟模型调用失败率为 ${failureRate.toFixed(1)}%。`,
      context: {
        failed: metrics.modelCallFailures,
        total: metrics.modelCallTotal,
      },
      metricValue: failureRate,
      ruleCode: "model_failure_rate_5m",
      thresholdValue: 10,
      title: "模型调用失败率异常",
      unit: "percent",
    }),
    rule({
      body: `等待超过 10 分钟的分析任务为 ${metrics.queuedOverTenMinutes} 个。`,
      context: { queuedJobs: metrics.queuedOverTenMinutes },
      metricValue: metrics.queuedOverTenMinutes,
      ruleCode: "queue_waiting_10m",
      thresholdValue: 500,
      title: "分析队列积压",
      unit: "count",
    }),
    rule({
      body:
        metrics.hourlyCostBaselineMicros <= 0
          ? "缺少过去 7 天同期成本基线，本窗口不触发成本告警。"
          : `本小时模型成本比过去 7 天同期均值高 ${costIncrease.toFixed(1)}%。`,
      context: {
        baselineMicros: metrics.hourlyCostBaselineMicros,
        currentMicros: metrics.hourlyCostCurrentMicros,
      },
      metricValue: costIncrease,
      ruleCode: "model_cost_hourly",
      thresholdValue: 50,
      title: "模型成本异常增长",
      unit: "percent",
      triggerAllowed: metrics.hourlyCostBaselineMicros > 0,
    }),
    rule({
      body:
        metrics.reportSampleCount === 0
          ? "最近 15 分钟没有已完成报告。"
          : `最近 15 分钟报告平均生成耗时为 ${Math.round(metrics.reportAverageLatencySeconds)} 秒。`,
      context: { sampleCount: metrics.reportSampleCount },
      metricValue: metrics.reportAverageLatencySeconds,
      ruleCode: "report_latency_15m",
      thresholdValue: 300,
      title: "报告生成耗时异常",
      unit: "seconds",
      triggerAllowed: metrics.reportSampleCount > 0,
    }),
  ];
}

function rule(input: {
  readonly body: string;
  readonly context: Record<string, number | string>;
  readonly metricValue: number;
  readonly ruleCode: string;
  readonly thresholdValue: number;
  readonly title: string;
  readonly triggerAllowed?: boolean;
  readonly unit: string;
}): AlertRuleEvaluation {
  const triggered =
    (input.triggerAllowed ?? true) && input.metricValue >= input.thresholdValue;
  return {
    ...input,
    fingerprint: `platform:${input.ruleCode}`,
    severity:
      triggered && input.metricValue >= input.thresholdValue * 2
        ? "critical"
        : "warning",
    triggered,
  };
}

export class AlertApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly secretBox: SecretBox,
    private readonly telegram: TelegramAdapter,
  ) {}

  async list(actor: NotificationActor) {
    await this.requireAdmin(actor);
    return this.database.alertEvent.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
    });
  }

  async acknowledge(alertId: string, actor: NotificationActor) {
    await this.requireAdmin(actor);
    return this.database.$transaction(async (transaction) => {
      const alert = await transaction.alertEvent.findUnique({
        where: { id: alertId },
      });
      if (!alert) throw new Error("ALERT_NOT_FOUND");
      if (alert.status !== AlertStatus.active)
        throw new Error("ALERT_NOT_ACTIVE");
      if (alert.acknowledgedAt) return alert;
      const acknowledged = await transaction.alertEvent.update({
        data: {
          acknowledgedAt: new Date(),
          acknowledgedById: actor.userId,
        },
        where: { id: alert.id },
      });
      const context = getRequestContext();
      await transaction.auditLog.create({
        data: {
          action: "alert.acknowledge",
          actorEmailMask: maskEmail(actor.email),
          actorId: actor.userId,
          actorType: "user",
          afterSummary: { acknowledged: true },
          id: uuidv7(),
          objectId: alert.id,
          objectType: "AlertEvent",
          outcome: AuditOutcome.success,
          requestId: context?.requestId ?? uuidv7(),
          riskLevel: "low",
          traceId: context?.traceId ?? "00000000000000000000000000000000",
        },
      });
      return acknowledged;
    });
  }

  async runScheduled(referenceTime = new Date()) {
    const retry = await this.database.alertEvaluationRun.findFirst({
      orderBy: { updatedAt: "asc" },
      where: {
        attempts: { lt: 3 },
        status: AlertEvaluationRunStatus.failed,
      },
    });
    if (retry)
      return this.run(retry.idempotencyKey, retry.referenceTime, retry.id);
    const bucket = referenceTime.toISOString().slice(0, 16);
    return this.run(`alert-evaluation/${bucket}`, referenceTime);
  }

  async processDueDeliveries(referenceTime = new Date()) {
    const due = await this.database.notificationDelivery.findMany({
      orderBy: { createdAt: "asc" },
      take: 20,
      where: {
        attempts: { lt: 4 },
        nextAttemptAt: { lte: referenceTime },
        payload: { path: ["kind"], equals: "platform_alert" },
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

  private async run(
    idempotencyKey: string,
    referenceTime: Date,
    retryId?: string,
  ) {
    const claim = retryId
      ? {
          execute: true,
          run: await this.database.alertEvaluationRun.update({
            data: {
              attempts: { increment: 1 },
              errorCode: null,
              startedAt: new Date(),
              status: AlertEvaluationRunStatus.running,
            },
            where: { id: retryId },
          }),
        }
      : await this.claimRun(idempotencyKey, referenceTime);
    const run = claim.run;
    if (!claim.execute) return run;
    try {
      const evaluations = evaluateAlertRules(
        await this.collectMetrics(referenceTime),
      );
      const counts = { opened: 0, resolved: 0, updated: 0 };
      for (const evaluation of evaluations) {
        const result = await this.applyEvaluation(evaluation, referenceTime);
        if (result !== "unchanged") counts[result] += 1;
      }
      return await this.database.$transaction(async (transaction) => {
        const completed = await transaction.alertEvaluationRun.update({
          data: {
            completedAt: new Date(),
            evaluatedRuleCount: evaluations.length,
            openedCount: counts.opened,
            resolvedCount: counts.resolved,
            status: AlertEvaluationRunStatus.completed,
            updatedCount: counts.updated,
          },
          where: { id: run.id },
        });
        await transaction.auditLog.create({
          data: {
            action: "alert.evaluation.run",
            actorType: "system",
            afterSummary: counts,
            id: uuidv7(),
            objectId: run.id,
            objectType: "AlertEvaluationRun",
            outcome: AuditOutcome.success,
            requestId: uuidv7(),
            riskLevel: "low",
            traceId: "00000000000000000000000000000000",
          },
        });
        return completed;
      });
    } catch (error) {
      const errorCode =
        error instanceof Error ? error.message : "ALERT_EVALUATION_FAILED";
      const failed = await this.database.alertEvaluationRun.update({
        data: {
          errorCode: errorCode.slice(0, 100),
          status:
            run.attempts >= run.maxAttempts
              ? AlertEvaluationRunStatus.dead_letter
              : AlertEvaluationRunStatus.failed,
        },
        where: { id: run.id },
      });
      await this.database.auditLog.create({
        data: {
          action: "alert.evaluation.run",
          actorType: "system",
          afterSummary: { errorCode: failed.errorCode },
          id: uuidv7(),
          objectId: run.id,
          objectType: "AlertEvaluationRun",
          outcome: AuditOutcome.failure,
          requestId: uuidv7(),
          riskLevel: "low",
          traceId: "00000000000000000000000000000000",
        },
      });
      throw error;
    }
  }

  private async claimRun(idempotencyKey: string, referenceTime: Date) {
    const existing = await this.database.alertEvaluationRun.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return { execute: false, run: existing };
    try {
      return {
        execute: true,
        run: await this.database.alertEvaluationRun.create({
          data: {
            id: uuidv7(),
            idempotencyKey,
            referenceTime,
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
        run: await this.database.alertEvaluationRun.findUniqueOrThrow({
          where: { idempotencyKey },
        }),
      };
    }
  }

  private async collectMetrics(
    referenceTime: Date,
  ): Promise<AlertMetricSnapshot> {
    const fiveMinutesAgo = new Date(referenceTime.getTime() - 5 * minute);
    const fifteenMinutesAgo = new Date(referenceTime.getTime() - 15 * minute);
    const tenMinutesAgo = new Date(referenceTime.getTime() - 10 * minute);
    const hourStart = new Date(referenceTime);
    hourStart.setUTCMinutes(0, 0, 0);
    const elapsed = referenceTime.getTime() - hourStart.getTime();
    const [
      modelCallTotal,
      modelCallFailures,
      queuedOverTenMinutes,
      currentCost,
      reports,
      ...baselineCosts
    ] = await Promise.all([
      this.database.modelCallLog.count({
        where: { createdAt: { gte: fiveMinutesAgo, lte: referenceTime } },
      }),
      this.database.modelCallLog.count({
        where: {
          createdAt: { gte: fiveMinutesAgo, lte: referenceTime },
          status: "failed",
        },
      }),
      this.database.analysisJob.count({
        where: { createdAt: { lte: tenMinutesAgo }, status: "queued" },
      }),
      this.database.modelCallLog.aggregate({
        _sum: { costMicros: true, webSearchCostMicros: true },
        where: { createdAt: { gte: hourStart, lte: referenceTime } },
      }),
      this.database.reportVersion.findMany({
        select: { createdAt: true, generatedAt: true },
        where: {
          generatedAt: {
            gte: fifteenMinutesAgo,
            lte: referenceTime,
            not: null,
          },
        },
      }),
      ...Array.from({ length: 7 }, (_, index) => {
        const start = new Date(
          hourStart.getTime() - (index + 1) * 24 * 60 * minute,
        );
        return this.database.modelCallLog.aggregate({
          _sum: { costMicros: true, webSearchCostMicros: true },
          where: {
            createdAt: {
              gte: start,
              lte: new Date(start.getTime() + elapsed),
            },
          },
        });
      }),
    ]);
    const reportLatencies = reports.flatMap((report) =>
      report.generatedAt
        ? [(report.generatedAt.getTime() - report.createdAt.getTime()) / 1000]
        : [],
    );
    const cost = (value: {
      _sum: {
        costMicros: bigint | null;
        webSearchCostMicros: bigint | null;
      };
    }) =>
      Number(
        (value._sum.costMicros ?? 0n) + (value._sum.webSearchCostMicros ?? 0n),
      );
    return {
      hourlyCostBaselineMicros:
        baselineCosts.reduce((sum, item) => sum + cost(item), 0) / 7,
      hourlyCostCurrentMicros: cost(currentCost),
      modelCallFailures,
      modelCallTotal,
      queuedOverTenMinutes,
      reportAverageLatencySeconds:
        reportLatencies.length === 0
          ? 0
          : reportLatencies.reduce((sum, value) => sum + value, 0) /
            reportLatencies.length,
      reportSampleCount: reportLatencies.length,
    };
  }

  private async applyEvaluation(
    evaluation: AlertRuleEvaluation,
    referenceTime: Date,
  ): Promise<"opened" | "resolved" | "unchanged" | "updated"> {
    return this.database.$transaction(
      async (transaction) => {
        const active = await transaction.alertEvent.findFirst({
          where: {
            fingerprint: evaluation.fingerprint,
            status: AlertStatus.active,
          },
        });
        if (!evaluation.triggered) {
          if (!active) return "unchanged";
          const resolved = await transaction.alertEvent.update({
            data: {
              body: evaluation.body,
              context: evaluation.context,
              metricValue: evaluation.metricValue,
              resolvedAt: referenceTime,
              status: AlertStatus.resolved,
            },
            where: { id: active.id },
          });
          await this.createNotifications(
            transaction,
            resolved,
            "resolved",
            referenceTime,
          );
          return "resolved";
        }
        if (!active) {
          const opened = await transaction.alertEvent.create({
            data: {
              body: evaluation.body,
              context: evaluation.context,
              fingerprint: evaluation.fingerprint,
              firstTriggeredAt: referenceTime,
              id: uuidv7(),
              lastTriggeredAt: referenceTime,
              metricValue: evaluation.metricValue,
              ruleCode: evaluation.ruleCode,
              severity: evaluation.severity,
              thresholdValue: evaluation.thresholdValue,
              title: evaluation.title,
              unit: evaluation.unit,
            },
          });
          await this.createNotifications(
            transaction,
            opened,
            "opened",
            referenceTime,
          );
          return "opened";
        }
        const shouldNotify =
          !active.lastNotifiedAt ||
          active.lastNotifiedAt.getTime() <=
            referenceTime.getTime() - updateIntervalMs;
        const updated = await transaction.alertEvent.update({
          data: {
            body: evaluation.body,
            context: evaluation.context,
            lastTriggeredAt: referenceTime,
            metricValue: evaluation.metricValue,
            occurrenceCount: { increment: 1 },
            severity: evaluation.severity,
          },
          where: { id: active.id },
        });
        if (shouldNotify)
          await this.createNotifications(
            transaction,
            updated,
            "updated",
            referenceTime,
          );
        return "updated";
      },
      { isolationLevel: "Serializable" },
    );
  }

  private async createNotifications(
    transaction: Prisma.TransactionClient,
    alert: {
      body: string;
      id: string;
      title: string;
    },
    transition: "opened" | "resolved" | "updated",
    referenceTime: Date,
  ) {
    const bucket =
      transition === "updated"
        ? referenceTime.toISOString().slice(0, 16)
        : transition;
    const title =
      transition === "resolved" ? `已恢复：${alert.title}` : alert.title;
    const text = `[映川告警] ${title}\n${alert.body}`;
    const config = await transaction.notificationChannelConfig.findUnique({
      where: { code: "telegram" },
    });
    if (config?.enabled && config.encryptedToken && config.encryptedChatId)
      await transaction.notificationDelivery.upsert({
        create: {
          channelConfigId: config.id,
          id: uuidv7(),
          idempotencyKey: `telegram/alert/${alert.id}/${transition}/${bucket}`,
          maxAttempts: 4,
          nextAttemptAt: referenceTime,
          payload: { alertId: alert.id, kind: "platform_alert", text },
        },
        update: {},
        where: {
          idempotencyKey: `telegram/alert/${alert.id}/${transition}/${bucket}`,
        },
      });
    await transaction.alertEvent.update({
      data: { lastNotifiedAt: referenceTime },
      where: { id: alert.id },
    });
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

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
