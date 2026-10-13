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
import {
  MonitoringApplicationService,
  type AnalysisApplicationService,
} from "@yingchuan/analysis";
import { vi } from "vitest";
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
  let failKimi = true;
  let failDoubao = false;
  const requestedOutputLimits: (number | undefined)[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_PEPPER = "analysis_test_pepper_at_least_32_characters";
    process.env.AUTH_RATE_LIMIT_PREFIX = `analysis-auth-${process.pid}-${Date.now()}`;
    emailSender = new AnalysisEmailSender();
    const adapter: ModelProviderAdapter = {
      invoke: (input) => {
        requestedOutputLimits.push(input.maxOutputTokens);
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
    await database.optimizationTask.deleteMany({ where: { projectId } });
    await database.monitoringSchedule.deleteMany({ where: { projectId } });
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
    expect(requestedOutputLimits.length).toBeGreaterThanOrEqual(2);
    expect(requestedOutputLimits.every((limit) => limit === 2048)).toBe(true);
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
    await request(app.getHttpServer())
      .get(`/api/v1/analysis-jobs/${first.body.data.id}/model-runs`)
      .expect(401);
    const answerRecords = await read()
      .get(`/api/v1/analysis-jobs/${first.body.data.id}/model-runs`)
      .expect(200);
    expect(answerRecords.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mentions: expect.arrayContaining([
            expect.objectContaining({ kind: "target" }),
          ]),
          parseResult: expect.objectContaining({ validSample: true }),
          result: expect.objectContaining({
            responseText: expect.stringContaining("分析测试项目"),
          }),
        }),
      ]),
    );
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

  it("returns real insights, confirmed competitors and citation evidence with tenant checks", async () => {
    const baseline = await database.analysisJob.findUniqueOrThrow({
      where: { idempotencyKey: `analysis:${userId}:analysis-partial-1` },
    });
    const competitor = await database.competitor.findFirstOrThrow({
      where: { projectId },
    });
    await database.competitor.update({
      where: { id: competitor.id },
      data: { status: "confirmed" },
    });
    const run = await database.modelRun.findFirstOrThrow({
      where: { analysisJobId: baseline.id, status: "succeeded" },
    });
    await database.modelRunResult.update({
      where: { modelRunId: run.id },
      data: {
        citations: [
          {
            url: "https://news.example.com/article?utm_source=ark",
            title: "品牌报道",
          },
          { url: "https://news.example.com/article" },
        ],
      },
    });
    const response = await read()
      .get(`/api/v1/projects/${projectId}/insights?days=30`)
      .expect(200);
    expect(response.body.data.summary).toMatchObject({
      mentionRate: 100,
      validSamples: 1,
      rankSamples: 1,
    });
    expect(response.body.data.competitors).toHaveLength(1);
    expect(response.body.data.citations.domains[0].count).toBe(1);
    expect(response.body.data.citations.articles[0].evidence[0]).toMatchObject({
      jobId: baseline.id,
      runId: run.id,
    });
    expect(response.body.data.trends[0].diagnosticOnly).toBe(true);
    await read()
      .get(`/api/v1/projects/${uuidv7()}/insights?days=30`)
      .expect(404);
    await read()
      .get(`/api/v1/projects/${projectId}/insights?days=8`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/projects/${projectId}/monitoring`)
      .expect(401);
    const foreignWorkspace = await database.workspace.create({
      data: {
        id: uuidv7(),
        name: "隔离工作区",
        slug: `isolation-${uuidv7()}`,
        createdById: userId,
      },
    });
    const foreignProject = await database.project.create({
      data: {
        id: uuidv7(),
        name: "隔离项目",
        workspaceId: foreignWorkspace.id,
        createdById: userId,
        status: "ready",
      },
    });
    try {
      await read()
        .get(`/api/v1/projects/${foreignProject.id}/insights?days=30`)
        .expect(404);
      await read()
        .get(`/api/v1/projects/${foreignProject.id}/monitoring`)
        .expect(404);
      await read()
        .get(`/api/v1/projects/${foreignProject.id}/optimization-tasks`)
        .expect(404);
    } finally {
      await database.workspace.delete({ where: { id: foreignWorkspace.id } });
    }
  });

  it("executes selected monitoring once, checks budgets, pauses and recovers an expired lease", async () => {
    const options = (
      await read().get(`/api/v1/projects/${projectId}/monitoring`).expect(200)
    ).body.data;
    const model = options.models[0];
    const prompt = options.prompts[0];
    const input = {
      name: "每日品牌监测",
      frequency: "daily",
      hour: 9,
      minute: 0,
      weekday: 1,
      promptIds: [prompt.id],
      modelConfigIds: [model.id],
      maxCostMicros: "10000000",
    };
    await write()
      .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
      .send({ ...input, maxCostMicros: "1" })
      .expect(409);
    await write()
      .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
      .send({ ...input, promptIds: [uuidv7()] })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
      .set("Cookie", cookie)
      .set("Origin", origin)
      .send(input)
      .expect(403);
    const schedule = (
      await write()
        .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
        .send(input)
        .expect(201)
    ).body.data;
    const modelVersion = await database.modelConfigVersion.findFirstOrThrow({
      where: { modelConfigId: model.id },
      orderBy: { versionNumber: "desc" },
    });
    await database.modelConfigVersion.update({
      where: { id: modelVersion.id },
      data: { outputPriceMicrosPerMillion: null },
    });
    try {
      const unpriced = await write()
        .post(`/api/v1/projects/${projectId}/monitoring/estimate`)
        .send({ promptIds: [prompt.id], modelConfigIds: [model.id] })
        .expect(409);
      expect(unpriced.body.error.code).toBe("MONITORING_PRICE_UNAVAILABLE");
    } finally {
      await database.modelConfigVersion.update({
        where: { id: modelVersion.id },
        data: {
          outputPriceMicrosPerMillion: modelVersion.outputPriceMicrosPerMillion,
        },
      });
    }
    const replayKey = `schedule-replay-${schedule.id}`;
    const once = await write()
      .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
      .set("Idempotency-Key", replayKey)
      .send(input)
      .expect(201);
    const again = await write()
      .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
      .set("Idempotency-Key", replayKey)
      .send(input)
      .expect(201);
    expect(again.body.data.id).toBe(once.body.data.id);
    await write()
      .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
      .set("Idempotency-Key", replayKey)
      .send({ ...input, name: "不同的计划" })
      .expect(409);
    const due = new Date(Date.now() - 60_000);
    await database.monitoringSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: due },
    });
    const monitoring = app.get(MonitoringApplicationService);
    await Promise.all([monitoring.runDue(), monitoring.runDue()]);
    const executions = await database.monitoringExecution.findMany({
      where: { scheduleId: schedule.id },
    });
    expect(executions).toHaveLength(1);
    expect(executions[0]?.status).toBe("submitted");
    const job = await database.analysisJob.findUniqueOrThrow({
      where: { id: executions[0]!.analysisJobId! },
      include: { runs: true },
    });
    expect(job.runs).toHaveLength(1);
    expect(job.runs[0]?.modelConfigVersionId).toBeDefined();
    // Recover after job submission succeeded but the execution acknowledgement was lost.
    await database.monitoringExecution.update({
      where: { id: executions[0]!.id },
      data: { status: "running", leaseUntil: due, analysisJobId: null },
    });
    await monitoring.runDue();
    expect(
      (
        await database.monitoringExecution.findUniqueOrThrow({
          where: { id: executions[0]!.id },
        })
      ).analysisJobId,
    ).toBe(job.id);
    expect(
      await database.analysisJob.count({
        where: { idempotencyKey: job.idempotencyKey },
      }),
    ).toBe(1);
    const current = await database.monitoringSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
    });
    await write()
      .patch(
        `/api/v1/projects/${projectId}/monitoring/schedules/${schedule.id}`,
      )
      .send({ active: false, version: current.version })
      .expect(200);
    await write()
      .patch(
        `/api/v1/projects/${projectId}/monitoring/schedules/${schedule.id}`,
      )
      .send({ active: true, version: current.version })
      .expect(409);
    const edited = await write()
      .patch(
        `/api/v1/projects/${projectId}/monitoring/schedules/${schedule.id}`,
      )
      .send({
        ...input,
        name: "更新后的监测",
        frequency: "weekly",
        version: current.version + 1,
      })
      .expect(200);
    expect(edited.body.data).toMatchObject({
      active: false,
      frequency: "weekly",
      name: "更新后的监测",
    });
    expect(
      await database.monitoringExecution.count({
        where: { scheduleId: schedule.id },
      }),
    ).toBe(1);
    await write()
      .patch(
        `/api/v1/projects/${projectId}/monitoring/schedules/${schedule.id}`,
      )
      .send({ ...input, version: current.version + 2, maxCostMicros: "1" })
      .expect(409);
  });

  it("records retry exhaustion and quota failures with one site notification", async () => {
    const options = (
      await read().get(`/api/v1/projects/${projectId}/monitoring`)
    ).body.data;
    const schedule = (
      await write()
        .post(`/api/v1/projects/${projectId}/monitoring/schedules`)
        .send({
          name: "失败路径",
          frequency: "daily",
          hour: 10,
          minute: 0,
          weekday: 1,
          promptIds: [options.prompts[0].id],
          modelConfigIds: [options.models[0].id],
          maxCostMicros: "10000000",
        })
        .expect(201)
    ).body.data;
    const monitoring = app.get(MonitoringApplicationService);
    const analysis = app.get<AnalysisApplicationService>(ANALYSIS_SERVICE);
    const fail = vi
      .spyOn(analysis, "create")
      .mockRejectedValue(new Error("database offline"));
    const now = new Date();
    await database.monitoringSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: now },
    });
    await monitoring.runDue(now);
    await monitoring.runDue(new Date(now.getTime() + 60_000));
    await monitoring.runDue(new Date(now.getTime() + 120_000));
    fail.mockRestore();
    const execution = await database.monitoringExecution.findFirstOrThrow({
      where: { scheduleId: schedule.id },
    });
    expect(execution).toMatchObject({ status: "dead_letter", attempts: 3 });
    await monitoring.runDue(new Date(now.getTime() + 180_000));
    expect(
      await database.notification.count({ where: { objectId: execution.id } }),
    ).toBe(1);
    await database.monitoringSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: new Date(now.getTime() + 240_000), maxCostMicros: 1n },
    });
    await monitoring.runDue(new Date(now.getTime() + 240_000));
    const skipped = await database.monitoringExecution.findFirstOrThrow({
      where: { scheduleId: schedule.id, status: "skipped" },
    });
    expect(skipped.errorCode).toBe("MONITORING_BUDGET_EXCEEDED");
    const balance =
      (
        await database.usageLedgerEntry.aggregate({
          where: { workspaceId, resourceType: "model_cost" },
          _sum: { quantityMicros: true },
        })
      )._sum.quantityMicros ?? 0n;
    await database.usageLedgerEntry.create({
      data: {
        id: uuidv7(),
        workspaceId,
        userId,
        entryType: "adjustment",
        resourceType: "model_cost",
        quantityMicros: -balance,
        source: "test_quota",
        idempotencyKey: `quota-empty-${schedule.id}`,
      },
    });
    try {
      await database.monitoringSchedule.update({
        where: { id: schedule.id },
        data: {
          nextRunAt: new Date(now.getTime() + 300_000),
          maxCostMicros: 10000000n,
        },
      });
      await monitoring.runDue(new Date(now.getTime() + 300_000));
      expect(
        await database.monitoringExecution.findFirst({
          where: {
            scheduleId: schedule.id,
            errorCode: "ANALYSIS_QUOTA_INSUFFICIENT",
            status: "skipped",
          },
        }),
      ).not.toBeNull();
    } finally {
      await database.usageLedgerEntry.create({
        data: {
          id: uuidv7(),
          workspaceId,
          userId,
          entryType: "adjustment",
          resourceType: "model_cost",
          quantityMicros: balance,
          source: "test_quota",
          idempotencyKey: `quota-restore-${schedule.id}`,
        },
      });
    }
  });

  it("shows an effect delta only for fully valid same-condition formal samples", async () => {
    failKimi = false;
    await database.modelConfig.updateMany({
      where: { modelFamily: { in: ["doubao", "kimi"] } },
      data: { status: "enabled" },
    });
    for (let i = 0; i < 9; i++)
      await write()
        .post(`/api/v1/projects/${projectId}/prompts`)
        .send({
          text: `品牌分析问题 ${i + 1}：有哪些特点和优势？`,
          category: "factual",
          scope: "global",
        })
        .expect(201);
    const baseline = await createJob("formal-baseline");
    async function complete(jobId: string) {
      const analysis = app.get<AnalysisApplicationService>(ANALYSIS_SERVICE);
      const events = await database.outboxEvent.findMany({
        where: {
          eventType: "analysis.model-run.requested",
          payload: { path: ["analysisJobId"], equals: jobId },
        },
      });
      for (const event of events) await analysis.executeEvent(event.id);
      const parseEvents = await database.outboxEvent.findMany({
        where: {
          eventType: "response.parse.requested",
          payload: { path: ["analysisJobId"], equals: jobId },
        },
      });
      for (const event of parseEvents)
        await new ScoringApplicationService(database).parseEvent(event.id);
    }
    await complete(baseline.id);
    const task = (
      await write()
        .post(`/api/v1/projects/${projectId}/optimization-tasks`)
        .send({
          title: "正式样本复测",
          description: "验证相同条件下的变化",
          baselineJobId: baseline.id,
        })
        .expect(201)
    ).body.data;
    const retest = (
      await write()
        .post(
          `/api/v1/projects/${projectId}/optimization-tasks/${task.id}/retests`,
        )
        .set("Idempotency-Key", "formal-retest")
        .send({ maxCostMicros: "10000000" })
        .expect(201)
    ).body.data;
    await complete(retest.analysisJobId);
    const tasks = (
      await read()
        .get(`/api/v1/projects/${projectId}/optimization-tasks`)
        .expect(200)
    ).body.data as {
      id: string;
      retests: { comparable: boolean; delta: number | null }[];
    }[];
    expect(tasks.find((row) => row.id === task.id)?.retests[0]).toMatchObject({
      comparable: true,
      delta: 0,
    });
    const filtered = await read()
      .get(
        `/api/v1/projects/${projectId}/insights?days=30&promptId=${(await database.modelRun.findFirstOrThrow({ where: { analysisJobId: baseline.id }, include: { promptVersion: true } })).promptVersion.promptId}`,
      )
      .expect(200);
    expect(
      filtered.body.data.trends.every(
        (row: { diagnosticOnly: boolean }) => row.diagnosticOnly,
      ),
    ).toBe(true);
  });

  it("manages tasks with optimistic locking and retests the original frozen versions", async () => {
    const baseline = await database.analysisJob.findUniqueOrThrow({
      where: { idempotencyKey: `analysis:${userId}:analysis-partial-1` },
      include: { runs: { include: { promptVersion: true } } },
    });
    await database.modelConfig.updateMany({
      where: { modelFamily: "kimi" },
      data: { status: "enabled" },
    });
    const input = {
      title: "完善品牌介绍",
      description: "补充产品与服务事实及证据",
      baselineJobId: baseline.id,
      assigneeId: userId,
      evidenceUrl: "https://example.com/brand",
    };
    await write()
      .post(`/api/v1/projects/${projectId}/optimization-tasks`)
      .send({ ...input, assigneeId: uuidv7() })
      .expect(400);
    await write()
      .post(`/api/v1/projects/${projectId}/optimization-tasks`)
      .send({ ...input, evidenceUrl: "javascript:alert(1)" })
      .expect(400);
    const task = (
      await write()
        .post(`/api/v1/projects/${projectId}/optimization-tasks`)
        .send(input)
        .expect(201)
    ).body.data;
    const changes = {
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      evidenceUrl: input.evidenceUrl,
    };
    await write()
      .patch(`/api/v1/projects/${projectId}/optimization-tasks/${task.id}`)
      .send({ ...changes, status: "in_progress", version: 1 })
      .expect(200);
    await write()
      .patch(`/api/v1/projects/${projectId}/optimization-tasks/${task.id}`)
      .send({ ...changes, status: "done", version: 1 })
      .expect(409);
    // A newly edited question must not enter a same-condition retest.
    const frozenPrompt = baseline.runs[0]!.promptVersion;
    await database.promptVersion.create({
      data: {
        ...frozenPrompt,
        id: uuidv7(),
        versionNumber: frozenPrompt.versionNumber + 1,
        text: "更新后的问题",
      },
    });
    const retest = await write()
      .post(
        `/api/v1/projects/${projectId}/optimization-tasks/${task.id}/retests`,
      )
      .set("Idempotency-Key", "same-condition")
      .send({ maxCostMicros: "10000000" })
      .expect(201);
    const repeated = await write()
      .post(
        `/api/v1/projects/${projectId}/optimization-tasks/${task.id}/retests`,
      )
      .set("Idempotency-Key", "same-condition")
      .send({ maxCostMicros: "10000000" })
      .expect(201);
    expect(repeated.body.data.analysisJobId).toBe(
      retest.body.data.analysisJobId,
    );
    const runs = await database.modelRun.findMany({
      where: { analysisJobId: retest.body.data.analysisJobId },
    });
    const conditions = (rows: typeof runs) =>
      rows
        .map((row) => [
          row.promptVersionId,
          row.modelConfigVersionId,
          row.scopeHash,
          row.nativeWebSearchEnabled,
          row.promptTextSnapshot,
        ])
        .sort();
    expect(conditions(runs)).toEqual(conditions(baseline.runs));
    const tasks = await read()
      .get(`/api/v1/projects/${projectId}/optimization-tasks`)
      .expect(200);
    expect(tasks.body.data[0].retests).toHaveLength(1);
    expect(tasks.body.data[0].retests[0]).toMatchObject({
      comparable: false,
      delta: null,
    });
    // Permission revocation is enforced server-side, including scheduler submission.
    const membership = await database.workspaceMembership.findFirstOrThrow({
      where: { userId, workspaceId },
    });
    const viewer = await database.role.findFirstOrThrow({
      where: { code: "viewer", scope: "workspace" },
    });
    await database.workspaceMembership.update({
      where: { id: membership.id },
      data: { roleId: viewer.id },
    });
    await read()
      .get(`/api/v1/projects/${projectId}/insights?days=7`)
      .expect(200);
    await write()
      .post(
        `/api/v1/projects/${projectId}/optimization-tasks/${task.id}/retests`,
      )
      .set("Idempotency-Key", "not-allowed")
      .send({ maxCostMicros: "10000000" })
      .expect(404);
    await write()
      .patch(`/api/v1/projects/${projectId}/optimization-tasks/${task.id}`)
      .send({ ...changes, status: "done", version: 2 })
      .expect(404);
    const schedule = await database.monitoringSchedule.findFirstOrThrow({
      where: { projectId, active: true },
    });
    const now = new Date(Date.now() + 600_000);
    await database.monitoringSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: now },
    });
    await app.get(MonitoringApplicationService).runDue(now);
    expect(
      await database.monitoringExecution.findFirst({
        where: {
          scheduleId: schedule.id,
          dueAt: now,
          errorCode: "RESOURCE_NOT_FOUND",
        },
      }),
    ).not.toBeNull();
    await database.workspaceMembership.update({
      where: { id: membership.id },
      data: { roleId: membership.roleId },
    });
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
      patch: (path: string) =>
        request(server)
          .patch(path)
          .set("Cookie", cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf),
      post: (path: string) =>
        request(server)
          .post(path)
          .set("Idempotency-Key", uuidv7())
          .set("Cookie", cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf),
    };
  }
});
