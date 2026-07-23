import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { writeFile } from "node:fs/promises";
import { AnalysisApplicationService } from "@yingchuan/analysis";
import { createDatabaseClient, type PrismaClient } from "@yingchuan/database";
import { DataLifecycleApplicationService } from "@yingchuan/data-lifecycle";
import { createServiceLogger } from "@yingchuan/observability";
import {
  ModelGatewayApplicationService,
  SecretBox,
  VolcengineArkAdapter,
} from "@yingchuan/model-gateway";
import { BullMqOutboxQueue, TransactionalOutbox } from "@yingchuan/outbox";
import { ProjectApplicationService } from "@yingchuan/projects";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { ScoringApplicationService } from "@yingchuan/scoring";
import { ReportApplicationService } from "@yingchuan/reports";
import {
  AlertApplicationService,
  NotificationApplicationService,
  OperationsDailyReportApplicationService,
  TelegramHttpAdapter,
} from "@yingchuan/notifications";
import { type Job, Worker } from "bullmq";

const logger = createServiceLogger({
  environment: process.env.NODE_ENV ?? "development",
  service: "yingchuan-worker",
  version: "0.1.0",
});

interface DomainEventMessage {
  readonly messageId?: unknown;
  readonly type?: unknown;
}

export async function writeWorkerHeartbeat(
  heartbeatFile: string | undefined,
  timestamp = Date.now(),
): Promise<void> {
  if (!heartbeatFile) return;
  await writeFile(heartbeatFile, String(timestamp), {
    encoding: "utf8",
    mode: 0o600,
  });
}

@Injectable()
export class WorkerService implements OnModuleInit, OnApplicationShutdown {
  private database?: PrismaClient;
  private alertScheduler?: NodeJS.Timeout;
  private dailyReportScheduler?: NodeJS.Timeout;
  private dispatcher?: NodeJS.Timeout;
  private lifecycleScheduler?: NodeJS.Timeout;
  private queue?: BullMqOutboxQueue;
  private consumer?: Worker<DomainEventMessage>;
  private running = false;
  private lastReconciledAt = 0;

  getStatus(): "ready" {
    return "ready";
  }

  onModuleInit(): void {
    const databaseUrl = getRuntimeValue("DATABASE_URL", {
      fallback:
        "postgresql://yingchuan:yingchuan_local_only@127.0.0.1:55432/yingchuan?schema=public",
    });
    const redisUrl = getRuntimeValue("REDIS_URL", {
      fallback: "redis://:yingchuan_local_only@127.0.0.1:56379/0",
    });
    this.database = createDatabaseClient(databaseUrl);
    this.queue = new BullMqOutboxQueue("domain-events", redisUrl);
    const projects = new ProjectApplicationService(this.database);
    const gateway = new ModelGatewayApplicationService(
      this.database,
      new SecretBox(
        getRuntimeValue("MODEL_CREDENTIAL_MASTER_KEY", {
          fallback: "yingchuan_local_model_key_change_before_production_32",
        }),
        getRuntimeValue("MODEL_CREDENTIAL_KEY_VERSION", {
          fallback: "local-v1",
        }),
      ),
      new VolcengineArkAdapter(),
    );
    const analysis = new AnalysisApplicationService(this.database, gateway);
    const scoring = new ScoringApplicationService(this.database);
    const reports = new ReportApplicationService(this.database);
    const notificationSecretBox = new SecretBox(
      getRuntimeValue("NOTIFICATION_CREDENTIAL_MASTER_KEY", {
        fallback: "yingchuan_local_notification_key_change_32",
      }),
      getRuntimeValue("NOTIFICATION_CREDENTIAL_KEY_VERSION", {
        fallback: "local-v1",
      }),
    );
    const telegram = new TelegramHttpAdapter();
    const notifications = new NotificationApplicationService(
      this.database,
      notificationSecretBox,
      telegram,
    );
    const alerts = new AlertApplicationService(
      this.database,
      notificationSecretBox,
      telegram,
    );
    const dailyReports = new OperationsDailyReportApplicationService(
      this.database,
      notificationSecretBox,
      telegram,
    );
    const lifecycle = new DataLifecycleApplicationService(
      this.database,
      process.env.PRIVATE_FILE_ROOT ?? "../../storage/private",
    );
    this.consumer = new Worker(
      "domain-events",
      async (job: Job<DomainEventMessage>) => {
        if (typeof job.data.messageId !== "string")
          throw new Error("EVENT_MESSAGE_ID_INVALID");
        if (job.data.type === "project.identification.requested") {
          await projects.completeIdentificationEvent(job.data.messageId);
        } else if (job.data.type === "source.fetch.requested") {
          await projects.completeSourceFetchEvent(job.data.messageId);
        } else if (job.data.type === "analysis.model-run.requested") {
          await analysis.executeEvent(job.data.messageId);
        } else if (job.data.type === "response.parse.requested") {
          await scoring.parseEvent(job.data.messageId);
        } else if (job.data.type === "report.generate.requested") {
          await reports.generateEvent(job.data.messageId);
        } else if (job.data.type === "report.ready") {
          await notifications.consumeReportReady(job.data.messageId);
        }
      },
      {
        concurrency: 4,
        connection: this.redisConnection(redisUrl),
      },
    );
    this.consumer.on(
      "failed",
      (job: Job<DomainEventMessage> | undefined, error: Error) => {
        logger.error(
          {
            attempt: job?.attemptsMade,
            errorCode: "DOMAIN_EVENT_CONSUME_FAILED",
            errorType: error.name,
            eventId: job?.data.messageId,
          },
          "domain_event_consume_failed",
        );
        if (
          job &&
          job.data.type === "project.identification.requested" &&
          typeof job.data.messageId === "string" &&
          job.attemptsMade >= (job.opts.attempts ?? 1)
        ) {
          void projects.failIdentificationEvent(
            job.data.messageId,
            "IDENTIFICATION_RETRY_EXHAUSTED",
          );
        } else if (
          job &&
          job.data.type === "source.fetch.requested" &&
          typeof job.data.messageId === "string" &&
          job.attemptsMade >= (job.opts.attempts ?? 1)
        ) {
          void projects.failSourceFetchEvent(
            job.data.messageId,
            "SOURCE_FETCH_RETRY_EXHAUSTED",
          );
        } else if (
          job &&
          job.data.type === "analysis.model-run.requested" &&
          typeof job.data.messageId === "string" &&
          job.attemptsMade >= (job.opts.attempts ?? 1)
        ) {
          void analysis.failEvent(
            job.data.messageId,
            "MODEL_RUN_WORKER_RETRY_EXHAUSTED",
          );
        }
      },
    );
    this.dispatcher = setInterval(() => void this.dispatchOutbox(), 1_000);
    const runLifecycle = () =>
      void lifecycle.runScheduled().catch((error: unknown) => {
        const errorCode =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "DATA_LIFECYCLE_RUN_FAILED";
        logger.error(
          {
            errorCode,
            errorType: error instanceof Error ? error.name : "UnknownError",
          },
          "data_lifecycle_run_failed",
        );
      });
    this.lifecycleScheduler = setInterval(runLifecycle, 15 * 60 * 1_000);
    this.lifecycleScheduler.unref();
    runLifecycle();
    const runAlerts = () =>
      void alerts
        .runScheduled()
        .then(() => alerts.processDueDeliveries())
        .catch((error: unknown) => {
          logger.error(
            {
              errorCode:
                error instanceof Error
                  ? error.message
                  : "ALERT_SCHEDULER_FAILED",
              errorType: error instanceof Error ? error.name : "UnknownError",
            },
            "alert_scheduler_failed",
          );
        });
    this.alertScheduler = setInterval(runAlerts, 60_000);
    this.alertScheduler.unref();
    runAlerts();
    const runDailyReports = () =>
      void dailyReports
        .runScheduled()
        .then(() => dailyReports.processDueDeliveries())
        .catch((error: unknown) => {
          logger.error(
            {
              errorCode:
                error instanceof Error
                  ? error.message
                  : "OPERATIONS_DAILY_REPORT_SCHEDULER_FAILED",
              errorType: error instanceof Error ? error.name : "UnknownError",
            },
            "operations_daily_report_scheduler_failed",
          );
        });
    this.dailyReportScheduler = setInterval(runDailyReports, 60_000);
    this.dailyReportScheduler.unref();
    runDailyReports();
    void this.dispatchOutbox();
    logger.info({ result: "ready" }, "worker_context_ready");
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.dispatcher) clearInterval(this.dispatcher);
    if (this.alertScheduler) clearInterval(this.alertScheduler);
    if (this.dailyReportScheduler) clearInterval(this.dailyReportScheduler);
    if (this.lifecycleScheduler) clearInterval(this.lifecycleScheduler);
    await this.consumer?.close();
    await this.queue?.close();
    await this.database?.$disconnect();
  }

  private async dispatchOutbox(): Promise<void> {
    if (this.running || !this.database || !this.queue) return;
    this.running = true;
    try {
      const result = await new TransactionalOutbox(this.database).dispatchBatch(
        this.queue,
        `worker-${process.pid}`,
      );
      if (result.published > 0 || result.deadLettered > 0) {
        logger.info(result, "outbox_batch_dispatched");
      }
      if (Date.now() - this.lastReconciledAt >= 60_000) {
        await new TransactionalOutbox(this.database).reconcileUnconsumed();
        await new AnalysisApplicationService(
          this.database,
          new ModelGatewayApplicationService(
            this.database,
            new SecretBox(
              getRuntimeValue("MODEL_CREDENTIAL_MASTER_KEY", {
                fallback:
                  "yingchuan_local_model_key_change_before_production_32",
              }),
              getRuntimeValue("MODEL_CREDENTIAL_KEY_VERSION", {
                fallback: "local-v1",
              }),
            ),
            new VolcengineArkAdapter(),
          ),
        ).reconcile();
        this.lastReconciledAt = Date.now();
      }
      await this.writeHeartbeat();
    } catch (error) {
      logger.error(
        {
          errorCode: "OUTBOX_DISPATCH_FAILED",
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        "outbox_dispatch_failed",
      );
    } finally {
      this.running = false;
    }
  }

  private redisConnection(redisUrl: string) {
    const parsed = new URL(redisUrl);
    return {
      db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
      host: parsed.hostname,
      password: parsed.password || undefined,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
    };
  }

  private async writeHeartbeat(): Promise<void> {
    await writeWorkerHeartbeat(process.env.WORKER_HEALTH_FILE);
  }
}
