import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ConfigStatus,
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
import { EMAIL_SENDER } from "../auth/auth.constants.js";
import type { EmailSender, SendCodeInput } from "../auth/email-sender.js";
import { configureApi } from "../configure-api.js";

class ModelEmailSender implements EmailSender {
  readonly codes = new Map<string, string>();

  sendCode(input: SendCodeInput): Promise<string> {
    this.codes.set(`${input.email}:${input.purpose}`, input.code);
    return Promise.resolve(`model-code-${this.codes.size}`);
  }

  sendWorkspaceInvitation(): Promise<string> {
    return Promise.resolve("model-invitation");
  }
}

interface LoginContext {
  readonly cookie: string;
  readonly csrf: string;
  readonly userId: string;
}

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const database = createDatabaseClient(databaseUrl);
const userOrigin = "https://app.chatway.chat";
const adminOrigin = "https://admin.chatway.chat";
const device = "model_gateway_test_device";

describe("model gateway administration, estimates and quota", () => {
  let app: INestApplication;
  let emailSender: ModelEmailSender;
  let user: LoginContext;
  let admin: LoginContext;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_PEPPER = "model_gateway_test_pepper_at_least_32_chars";
    process.env.AUTH_RATE_LIMIT_PREFIX = `models-auth-${process.pid}-${Date.now()}`;
    process.env.MODEL_CREDENTIAL_MASTER_KEY =
      "model_gateway_test_master_key_longer_than_32_characters";
    process.env.ADMIN_ALLOWED_EMAILS = "geyaovip@163.com";
    emailSender = new ModelEmailSender();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.init();
    user = await login("model-owner@example.com", "user", userOrigin);
    admin = await login("geyaovip@163.com", "admin", adminOrigin);
    const workspace = await write(user, userOrigin)
      .post("/api/v1/workspaces")
      .send({ name: "模型网关测试工作区" })
      .expect(201);
    workspaceId = workspace.body.data.id as string;
    projectId = uuidv7();
    await database.project.create({
      data: {
        createdById: user.userId,
        id: projectId,
        name: "模型网关测试项目",
        onboardingStatus: "completed",
        status: ProjectStatus.ready,
        workspaceId,
      },
    });
    await write(user, userOrigin)
      .post(`/api/v1/projects/${projectId}/prompts`)
      .send({
        category: "factual",
        requiresWebSearch: true,
        scope: "global",
        text: "这个品牌最近有哪些可核验的公开动态？",
      })
      .expect(201);
    await database.usageLedgerEntry.create({
      data: {
        entryType: UsageEntryType.grant,
        id: uuidv7(),
        idempotencyKey: `test-grant-${projectId}`,
        quantityMicros: 10_000_000n,
        resourceType: "model_cost",
        source: "test_grant",
        userId: user.userId,
        workspaceId,
      },
    });
  });

  afterAll(async () => {
    const provider = await database.modelProvider.findUnique({
      where: { code: "volcengine_ark" },
    });
    if (provider) {
      await database.modelProvider.update({
        data: { status: ConfigStatus.disabled },
        where: { id: provider.id },
      });
      const configs = await database.modelConfig.findMany({
        where: { providerId: provider.id },
      });
      await database.modelCallLog.deleteMany({
        where: {
          modelConfigVersion: {
            modelConfigId: { in: configs.map((item) => item.id) },
          },
        },
      });
      await database.modelConfig.updateMany({
        data: { status: ConfigStatus.disabled },
        where: { providerId: provider.id },
      });
      await database.modelConfigVersion.deleteMany({
        where: {
          modelConfigId: { in: configs.map((item) => item.id) },
          versionNumber: { gt: 1 },
        },
      });
      await database.modelProviderCredential.deleteMany({
        where: { providerId: provider.id },
      });
    }
    await database.auditLog.deleteMany({
      where: { actorId: { in: [user.userId, admin.userId] } },
    });
    await database.usageLedgerEntry.deleteMany({ where: { workspaceId } });
    await database.promptVersion.deleteMany({
      where: { prompt: { projectId } },
    });
    await database.prompt.deleteMany({ where: { projectId } });
    await database.project.deleteMany({ where: { id: projectId } });
    await database.workspace.deleteMany({ where: { id: workspaceId } });
    await database.emailCodeChallenge.deleteMany({
      where: {
        emailNormalized: {
          in: ["model-owner@example.com", "geyaovip@163.com"],
        },
      },
    });
    await database.platformRoleAssignment.deleteMany({
      where: { userId: admin.userId },
    });
    await database.authSession.deleteMany({
      where: { userId: { in: [user.userId, admin.userId] } },
    });
    await database.user.deleteMany({
      where: { id: { in: [user.userId, admin.userId] } },
    });
    await app.close();
    await database.$disconnect();
  });

  it("requires step-up, never returns a secret and enables models independently", async () => {
    const list = await read(admin, adminOrigin)
      .get("/api/v1/admin/model-providers")
      .expect(200);
    const provider = list.body.data[0] as {
      credentialConfigured: boolean;
      id: string;
      modelConfigs: { id: string; modelFamily: string }[];
    };
    expect(provider.credentialConfigured).toBe(false);
    await write(admin, adminOrigin)
      .put(`/api/v1/admin/model-providers/${provider.id}/credential`)
      .send({ credential: "ark-test-secret-never-returned" })
      .expect(403)
      .expect(({ body }) =>
        expect(body.error.code).toBe("AUTH_STEP_UP_REQUIRED"),
      );

    await write(admin, adminOrigin)
      .post("/api/v1/auth/step-up-code-requests")
      .expect(202);
    await write(admin, adminOrigin)
      .post("/api/v1/auth/step-up-code-verifications")
      .send({ code: emailSender.codes.get("geyaovip@163.com:step_up") })
      .expect(201);
    const credential = await write(admin, adminOrigin)
      .put(`/api/v1/admin/model-providers/${provider.id}/credential`)
      .send({ credential: "ark-test-secret-never-returned" })
      .expect(200);
    expect(JSON.stringify(credential.body)).not.toContain("never-returned");

    await write(admin, adminOrigin)
      .patch(`/api/v1/admin/model-providers/${provider.id}/status`)
      .send({ status: "enabled" })
      .expect(200);
    const doubao = provider.modelConfigs.find(
      (item) => item.modelFamily === "doubao",
    )!;
    const kimi = provider.modelConfigs.find(
      (item) => item.modelFamily === "kimi",
    )!;
    await configureModel(doubao.id, "fixture-doubao-web", true);
    await configureModel(kimi.id, "fixture-kimi-no-web", false);

    const refreshed = await read(admin, adminOrigin)
      .get("/api/v1/admin/model-providers")
      .expect(200);
    expect(refreshed.body.data[0].modelConfigs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelFamily: "doubao", status: "enabled" }),
        expect.objectContaining({ modelFamily: "kimi", status: "enabled" }),
        expect.objectContaining({ modelFamily: "glm", status: "disabled" }),
      ]),
    );
  });

  it("explains unsupported web runs and reserves quota idempotently", async () => {
    const estimate = await write(user, userOrigin)
      .post(`/api/v1/projects/${projectId}/analysis-estimates`)
      .expect(201);
    expect(estimate.body.data).toMatchObject({
      eligibleRunCount: 1,
      skippedRunCount: 1,
    });
    expect(BigInt(estimate.body.data.estimatedCostMicros)).toBeGreaterThan(0n);
    expect(estimate.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelFamily: "doubao", status: "eligible" }),
        expect.objectContaining({ modelFamily: "kimi", status: "unsupported" }),
      ]),
    );

    const first = await write(user, userOrigin)
      .post(`/api/v1/projects/${projectId}/usage-reservations`)
      .set("Idempotency-Key", `reserve-${projectId}`)
      .expect(201);
    const repeated = await write(user, userOrigin)
      .post(`/api/v1/projects/${projectId}/usage-reservations`)
      .set("Idempotency-Key", `reserve-${projectId}`)
      .expect(201);
    expect(repeated.body.data.id).toBe(first.body.data.id);
    expect(
      await database.usageLedgerEntry.count({
        where: { idempotencyKey: `reserve-${projectId}` },
      }),
    ).toBe(1);
    const usage = await read(user, userOrigin)
      .get(`/api/v1/workspaces/${workspaceId}/usage`)
      .expect(200);
    expect(BigInt(usage.body.data.balanceMicros)).toBeLessThan(10_000_000n);
  });

  it("isolates a model failure and records sanitized call observability", async () => {
    const configs = await database.modelConfig.findMany({
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      where: { modelFamily: { in: ["doubao", "kimi"] } },
    });
    const adapter: ModelProviderAdapter = {
      invoke: (input) => {
        if (input.modelCode.includes("kimi"))
          return Promise.reject(
            new ModelGatewayError(
              "provider_unavailable",
              "PROVIDER_UNAVAILABLE",
              true,
            ),
          );
        return Promise.resolve({
          citations: [],
          inputTokens: 12,
          outputTokens: 34,
          providerRequestId: "safe-provider-id",
          text: "可用模型的回答",
        });
      },
    };
    const service = new ModelGatewayApplicationService(
      database,
      new SecretBox("model_gateway_test_master_key_longer_than_32_characters"),
      adapter,
    );
    const outcomes = await service.invokeBatch(
      configs.map((config, index) => ({
        input: {
          prompt: "测试模型隔离",
          requestId: `model-isolation-${projectId}-${index}`,
          workspaceId,
        },
        modelConfigVersionId: config.versions[0]!.id,
      })),
    );
    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "succeeded" }),
        expect.objectContaining({
          errorCode: "PROVIDER_UNAVAILABLE",
          status: "failed",
        }),
      ]),
    );
    const calls = await read(admin, adminOrigin)
      .get("/api/v1/admin/model-calls?limit=10")
      .expect(200);
    expect(calls.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inputTokens: 12, status: "succeeded" }),
        expect.objectContaining({
          errorCategory: "provider_unavailable",
          retryCount: 2,
          status: "failed",
        }),
      ]),
    );
    expect(JSON.stringify(calls.body)).not.toContain("ark-test-secret");
  });

  async function configureModel(
    id: string,
    modelCode: string,
    nativeWebSearch: boolean,
  ) {
    await write(admin, adminOrigin)
      .put(`/api/v1/admin/model-configs/${id}`)
      .send({
        apiMode: "chat_completions",
        displayName: modelCode,
        inputPriceMicrosPerMillion: "1000000",
        maxConcurrency: 2,
        modelCode,
        nativeWebSearch,
        outputPriceMicrosPerMillion: "2000000",
        status: "enabled",
        timeoutMs: 30000,
        ...(nativeWebSearch ? { webSearchConfig: { type: "web_search" } } : {}),
      })
      .expect(200);
  }

  async function login(
    email: string,
    audience: "user" | "admin",
    origin: string,
  ): Promise<LoginContext> {
    await request(app.getHttpServer())
      .post("/api/v1/auth/email-code-requests")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience, email })
      .expect(202);
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/email-code-verifications")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience, code: emailSender.codes.get(`${email}:login`), email })
      .expect(201);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    return {
      cookie: cookies[0]!.split(";")[0]!,
      csrf: response.body.data.csrfToken as string,
      userId: response.body.data.userId as string,
    };
  }

  function read(context: LoginContext, origin: string) {
    return {
      get: (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .set("Cookie", context.cookie)
          .set("Origin", origin),
    };
  }

  function write(context: LoginContext, origin: string) {
    const base = (method: "patch" | "post" | "put", path: string) => {
      const agent = request(app.getHttpServer());
      return agent[method](path)
        .set("Cookie", context.cookie)
        .set("Origin", origin)
        .set("X-CSRF-Token", context.csrf)
        .set("X-Device-Id", device);
    };
    return {
      patch: (path: string) => base("patch", path),
      post: (path: string) => base("post", path),
      put: (path: string) => base("put", path),
    };
  }
});
