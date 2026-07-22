import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ConfigStatus,
  ModelFamily,
  ProjectStatus,
  UsageEntryType,
  createDatabaseClient,
} from "@yingchuan/database";
import {
  ModelGatewayApplicationService,
  ModelGatewayError,
  SecretBox,
  type ModelProviderAdapter,
} from "@yingchuan/model-gateway";
import request from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.js";
import { ANALYSIS_SERVICE } from "./analysis.constants.js";
import type { AnalysisApplicationService } from "@yingchuan/analysis";
import { ScoringApplicationService } from "@yingchuan/scoring";
import { ReportApplicationService } from "@yingchuan/reports";
import {
  NotificationApplicationService,
  type TelegramAdapter,
} from "@yingchuan/notifications";
import { EMAIL_SENDER } from "../auth/auth.constants.js";
import type { EmailSender, SendCodeInput } from "../auth/email-sender.js";
import { configureApi } from "../configure-api.js";
import { MODEL_GATEWAY_SERVICE } from "../models/model.constants.js";

class AnalysisEmailSender implements EmailSender {
  code = "";
  sendCode(input: SendCodeInput): Promise<string> {
    this.code = input.code;
    return Promise.resolve("analysis-email");
  }
  sendWorkspaceInvitation(): Promise<string> {
    return Promise.resolve("analysis-invitation");
  }
}

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const database = createDatabaseClient(databaseUrl);
const origin = "https://app.chatway.chat";
const device = "analysis_test_device";
const masterKey = "analysis_test_master_key_that_is_longer_than_32_chars";

describe("analysis jobs, runs, cancellation and retries", () => {
  let app: INestApplication;
  let emailSender: AnalysisEmailSender;
  let cookie: string;
  let csrf: string;
  let userId: string;
  let workspaceId: string;
  let projectId: string;
  const failKimi = true;
  let failDoubao = false;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_PEPPER = "analysis_test_pepper_at_least_32_characters";
    process.env.AUTH_RATE_LIMIT_PREFIX = `analysis-auth-${process.pid}-${Date.now()}`;
    emailSender = new AnalysisEmailSender();
    const adapter: ModelProviderAdapter = {
      invoke: (input) => {
        if (
          (input.modelCode.includes("kimi") && failKimi) ||
          (input.modelCode.includes("doubao") && failDoubao)
        )
          return Promise.reject(
            new ModelGatewayError("rate_limit", "PROVIDER_RATE_LIMITED", true),
          );
        return Promise.resolve({
          citations: [],
          inputTokens: 20,
          outputTokens: 40,
          providerRequestId: `provider-${input.requestId}`,
          text: `1. 分析测试项目：值得推荐\n2. 星河品牌：也可考虑\n模型：${input.modelCode}`,
        });
      },
    };
    const gateway = new ModelGatewayApplicationService(
      database,
      new SecretBox(masterKey),
      adapter,
    );
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .overrideProvider(MODEL_GATEWAY_SERVICE)
      .useValue(gateway)
      .compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.init();
    await request(app.getHttpServer())
      .post("/api/v1/auth/email-code-requests")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience: "user", email: "analysis-owner@example.com" })
      .expect(202);
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/email-code-verifications")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({
        audience: "user",
        code: emailSender.code,
        email: "analysis-owner@example.com",
      })
      .expect(201);
    cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(
      ";",
    )[0]!;
    csrf = login.body.data.csrfToken as string;
    userId = login.body.data.userId as string;
    const workspace = await write()
      .post("/api/v1/workspaces")
      .send({ name: "分析测试工作区" })
      .expect(201);
    workspaceId = workspace.body.data.id as string;
    projectId = uuidv7();
    await database.project.create({
      data: {
        createdById: userId,
        id: projectId,
        name: "分析测试项目",
        onboardingStatus: "completed",
        status: ProjectStatus.ready,
        workspaceId,
      },
    });
    await write()
      .post(`/api/v1/projects/${projectId}/prompts`)
      .send({
        category: "factual",
        scope: "global",
        text: "这个品牌有哪些特点？",
      })
      .expect(201);
    await database.usageLedgerEntry.create({
      data: {
        entryType: UsageEntryType.grant,
        id: uuidv7(),
        idempotencyKey: `analysis-grant-${projectId}`,
        quantityMicros: 100_000_000n,
        resourceType: "model_cost",
        source: "test_grant",
        userId,
        workspaceId,
      },
    });
    const provider = await database.modelProvider.findUniqueOrThrow({
      where: { code: "volcengine_ark" },
    });
    const encrypted = new SecretBox(masterKey).encrypt(
      "analysis-ark-credential",
    );
    await database.modelProviderCredential.create({
      data: { id: uuidv7(), providerId: provider.id, ...encrypted },
    });
    await database.modelProvider.update({
      data: { status: ConfigStatus.enabled },
      where: { id: provider.id },
    });
    await database.modelConfig.updateMany({
      data: { status: ConfigStatus.disabled },
      where: { providerId: provider.id },
    });
    for (const family of [ModelFamily.doubao, ModelFamily.kimi]) {
      const config = await database.modelConfig.findFirstOrThrow({
        where: { modelFamily: family, providerId: provider.id },
      });
      await database.modelConfig.update({
        data: { status: ConfigStatus.enabled },
        where: { id: config.id },
      });
      await database.modelConfigVersion.update({
        data: {
          inputPriceMicrosPerMillion: 1_000_000n,
          modelCode: `analysis-${family}`,
          outputPriceMicrosPerMillion: 2_000_000n,
        },
        where: {
          modelConfigId_versionNumber: {
            modelConfigId: config.id,
            versionNumber: 1,
          },
        },
      });
    }
  });

  afterAll(async () => {
    await database.notificationDelivery.deleteMany({
      where: { notification: { workspaceId } },
    });
    await database.notification.deleteMany({ where: { workspaceId } });
    const events = await database.outboxEvent.findMany({
      select: { id: true },
      where: { workspaceId },
    });
    await database.inboxReceipt.deleteMany({
      where: { eventId: { in: events.map((item) => item.id) } },
    });
    await database.outboxEvent.deleteMany({
      where: { workspaceId },
    });
    await database.modelCallLog.deleteMany({ where: { workspaceId } });
    const jobIds = (
      await database.analysisJob.findMany({
        select: { id: true },
        where: { workspaceId },
      })
    ).map((item) => item.id);
    const reportVersionIds = (
      await database.reportVersion.findMany({
        select: { id: true },
        where: { report: { projectId } },
      })
    ).map((item) => item.id);
    await database.reportViewEvent.deleteMany({
      where: { reportVersionId: { in: reportVersionIds } },
    });
    await database.optimizationRecommendation.deleteMany({
      where: { reportVersionId: { in: reportVersionIds } },
    });
    await database.reportVersion.deleteMany({
      where: { id: { in: reportVersionIds } },
    });
    await database.report.deleteMany({ where: { projectId } });
    const scoreIds = (
      await database.visibilityScore.findMany({
        select: { id: true },
        where: { analysisJobId: { in: jobIds } },
      })
    ).map((item) => item.id);
    await database.visibilityDimensionScore.deleteMany({
      where: { visibilityScoreId: { in: scoreIds } },
    });
    await database.visibilityScore.deleteMany({
      where: { analysisJobId: { in: jobIds } },
    });
    await database.entityReviewIssue.deleteMany({ where: { projectId } });
    await database.entityMention.deleteMany({
      where: { modelRun: { analysisJob: { workspaceId } } },
    });
    await database.factClaim.deleteMany({
      where: { modelRun: { analysisJob: { workspaceId } } },
    });
    await database.runParseResult.deleteMany({
      where: { modelRun: { analysisJob: { workspaceId } } },
    });
    await database.modelRunResult.deleteMany({
      where: { modelRun: { analysisJob: { workspaceId } } },
    });
    await database.runAttempt.deleteMany({
      where: { modelRun: { analysisJob: { workspaceId } } },
    });
    await database.modelRun.deleteMany({
      where: { analysisJob: { workspaceId } },
    });
    await database.usageLedgerEntry.deleteMany({ where: { workspaceId } });
    await database.analysisJob.deleteMany({ where: { workspaceId } });
    await database.competitorAlias.deleteMany({
      where: { competitor: { projectId } },
    });
    await database.competitor.deleteMany({ where: { projectId } });
    await database.promptVersion.deleteMany({
      where: { prompt: { projectId } },
    });
    await database.prompt.deleteMany({ where: { projectId } });
    await database.project.deleteMany({ where: { id: projectId } });
    await database.workspace.deleteMany({ where: { id: workspaceId } });
    const provider = await database.modelProvider.findUniqueOrThrow({
      where: { code: "volcengine_ark" },
    });
    await database.modelProviderCredential.deleteMany({
      where: { providerId: provider.id },
    });
    await database.modelConfig.updateMany({
      data: { status: ConfigStatus.disabled },
      where: { providerId: provider.id },
    });
    await database.modelProvider.update({
      data: { status: ConfigStatus.disabled },
      where: { id: provider.id },
    });
    await database.auditLog.deleteMany({ where: { actorId: userId } });
    await database.emailCodeChallenge.deleteMany({
      where: { emailNormalized: "analysis-owner@example.com" },
    });
    await database.authSession.deleteMany({ where: { userId } });
    await database.user.deleteMany({ where: { id: userId } });
    await app.close();
    await database.$disconnect();
  });

  it("creates idempotently, freezes two runs and converges to partial success", async () => {
    const first = await write()
      .post(`/api/v1/projects/${projectId}/analysis-jobs`)
      .set("Idempotency-Key", "analysis-partial-1")
      .expect(201);
    const repeated = await write()
      .post(`/api/v1/projects/${projectId}/analysis-jobs`)
      .set("Idempotency-Key", "analysis-partial-1")
      .expect(201);
    expect(repeated.body.data.id).toBe(first.body.data.id);
    expect(first.body.data.runs).toHaveLength(2);
    expect(
      await database.usageLedgerEntry.count({
        where: { relatedJobId: first.body.data.id, entryType: "reservation" },
      }),
    ).toBe(1);

    const events = await database.outboxEvent.findMany({
      where: {
        payload: { path: ["analysisJobId"], equals: first.body.data.id },
      },
    });
    const analysis = app.get<AnalysisApplicationService>(ANALYSIS_SERVICE);
    for (const event of events) await analysis.executeEvent(event.id);
    const completed = await read()
      .get(`/api/v1/analysis-jobs/${first.body.data.id}`)
      .expect(200);
    expect(completed.body.data).toMatchObject({
      failedRuns: 1,
      status: "partially_completed",
      succeededRuns: 1,
    });
    expect(
      await database.usageLedgerEntry.count({
        where: { relatedJobId: first.body.data.id },
      }),
    ).toBe(3);
    const parseEvents = await database.outboxEvent.findMany({
      where: {
        eventType: "response.parse.requested",
        payload: { path: ["analysisJobId"], equals: first.body.data.id },
      },
    });
    const scoring = new ScoringApplicationService(database);
    for (const event of parseEvents) await scoring.parseEvent(event.id);
    const scores = await read()
      .get(`/api/v1/projects/${projectId}/scores`)
      .expect(200);
    expect(scores.body.data[0]).toMatchObject({
      diagnosticOnly: true,
      scoreVersion: "score-v1",
      validSampleCount: 1,
    });
    expect(scores.body.data[0].dimensions).toHaveLength(8);
    const competitors = await read()
      .get(`/api/v1/projects/${projectId}/competitors`)
      .expect(200);
    expect(competitors.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          normalizedName: "星河",
          status: "candidate",
        }),
      ]),
    );
    const reportEvents = await database.outboxEvent.findMany({
      where: {
        eventType: "report.generate.requested",
        aggregateId: scores.body.data[0].id,
      },
    });
    const reports = new ReportApplicationService(database);
    for (const event of reportEvents) await reports.generateEvent(event.id);
    const reportList = await read()
      .get(`/api/v1/projects/${projectId}/reports`)
      .expect(200);
    expect(reportList.body.data[0]).toMatchObject({
      status: "ready",
      versionNumber: 1,
    });
    expect(reportList.body.data[0].limitationSummary).toContain("未成功");
    await read()
      .get(
        `/api/v1/projects/${projectId}/reports/${reportList.body.data[0].id}`,
      )
      .expect(200);
    const notificationEvents = await database.outboxEvent.findMany({
      where: {
        aggregateId: reportList.body.data[0].id,
        eventType: "report.ready",
      },
    });
    const telegram: TelegramAdapter = {
      send: () => Promise.resolve({ messageId: "test-message" }),
    };
    const notifications = new NotificationApplicationService(
      database,
      new SecretBox(masterKey),
      telegram,
    );
    for (const event of notificationEvents)
      await notifications.consumeReportReady(event.id);
    const inbox = await read().get("/api/v1/notifications").expect(200);
    expect(inbox.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "report.ready", userId }),
      ]),
    );
  });

  it("cancels queued runs and retries a retryable failed run without duplicating it", async () => {
    const cancelled = await createJob("analysis-cancel-1");
    const cancellation = await write()
      .post(`/api/v1/analysis-jobs/${cancelled.id}/cancellation`)
      .send({ reason: "用户取消测试" })
      .expect(201);
    expect(cancellation.body.data).toMatchObject({
      status: "cancelled",
      cancelledRuns: 2,
    });

    await database.modelConfig.updateMany({
      data: { status: ConfigStatus.disabled },
      where: { modelFamily: ModelFamily.kimi },
    });
    failDoubao = true;
    const failed = await createJob("analysis-retry-1");
    const firstEvent = await database.outboxEvent.findFirstOrThrow({
      orderBy: { createdAt: "desc" },
      where: { payload: { path: ["analysisJobId"], equals: failed.id } },
    });
    const analysis = app.get<AnalysisApplicationService>(ANALYSIS_SERVICE);
    await analysis.executeEvent(firstEvent.id);
    expect(
      (await read().get(`/api/v1/analysis-jobs/${failed.id}`)).body.data.status,
    ).toBe("failed");
    failDoubao = false;
    const retried = await write()
      .post(`/api/v1/analysis-jobs/${failed.id}/retries`)
      .expect(201);
    expect(retried.body.data.runs).toHaveLength(1);
    const retryEvent = await database.outboxEvent.findFirstOrThrow({
      orderBy: { createdAt: "desc" },
      where: { aggregateId: retried.body.data.runs[0].id },
    });
    await analysis.executeEvent(retryEvent.id);
    const recovered = await read()
      .get(`/api/v1/analysis-jobs/${failed.id}`)
      .expect(200);
    expect(recovered.body.data).toMatchObject({
      status: "completed",
      succeededRuns: 1,
    });
    expect(recovered.body.data.runs[0].attempts[0].attemptNumber).toBe(2);
  });

  async function createJob(key: string) {
    const response = await write()
      .post(`/api/v1/projects/${projectId}/analysis-jobs`)
      .set("Idempotency-Key", key)
      .expect(201);
    return response.body.data as { id: string; runs: { id: string }[] };
  }

  function read() {
    return {
      get: (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .set("Cookie", cookie)
          .set("Origin", origin),
    };
  }

  function write() {
    const server = app.getHttpServer();
    return {
      post: (path: string) =>
        request(server)
          .post(path)
          .set("Cookie", cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf),
    };
  }
});
