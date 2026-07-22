import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createDatabaseClient } from "@yingchuan/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { AppModule } from "../app.module.js";
import { configureApi } from "../configure-api.js";
import { EMAIL_SENDER } from "./auth.constants.js";
import type { EmailSender, SendCodeInput } from "./email-sender.js";

class FakeEmailSender implements EmailSender {
  readonly messages = new Map<string, SendCodeInput>();
  failNext = false;

  sendCode(input: SendCodeInput): Promise<string> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("expected delivery failure"));
    }
    this.messages.set(`${input.email}:${input.purpose}`, input);
    return Promise.resolve(`resend-test-${this.messages.size}`);
  }

  sendWorkspaceInvitation(): Promise<string> {
    return Promise.resolve("resend-invitation-test");
  }
}

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const database = createDatabaseClient(databaseUrl);
const device = "test_device_e1_auth";
const userOrigin = "https://app.chatway.chat";
const adminOrigin = "https://admin.chatway.chat";

describe("email code authentication", () => {
  let app: INestApplication;
  let emailSender: FakeEmailSender;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.ADMIN_ALLOWED_EMAILS = "geyaovip@163.com";
    process.env.AUTH_PEPPER = "e1_test_auth_pepper_at_least_32_chars";
    process.env.AUTH_RATE_LIMIT_PREFIX = `auth-test-${process.pid}-${Date.now()}`;
    emailSender = new FakeEmailSender();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.init();
  });

  afterAll(async () => {
    const users = await database.user.findMany({
      select: { id: true },
      where: {
        OR: [
          { emailNormalized: { startsWith: "e1-" } },
          { emailNormalized: "geyaovip@163.com" },
        ],
      },
    });
    const userIds = users.map(({ id }) => id);
    await database.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await database.legalHold.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await database.workspace.deleteMany({
      where: { slug: { startsWith: "e1-lifecycle-" } },
    });
    await database.emailCodeChallenge.deleteMany({
      where: {
        OR: [
          { emailNormalized: { startsWith: "e1-" } },
          { emailNormalized: "geyaovip@163.com" },
        ],
      },
    });
    await database.user.deleteMany({
      where: {
        OR: [
          { emailNormalized: { startsWith: "e1-" } },
          { emailNormalized: "geyaovip@163.com" },
        ],
      },
    });
    await app.close();
    await database.$disconnect();
  });

  it("completes login, session, CSRF rejection, logout and revocation", async () => {
    const email = "e1-user@example.com";
    await requestCode(email, "user", userOrigin).expect(202);
    const code = emailSender.messages.get(`${email}:login`)!.code;
    const verification = await verifyCode(
      email,
      code,
      "user",
      userOrigin,
    ).expect(201);

    const setCookie = verification.headers["set-cookie"] as unknown as string[];
    expect(setCookie[0]).toContain("yc_session=");
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("Secure");
    expect(setCookie[0]).toContain("SameSite=Lax");
    expect(setCookie[0]).not.toContain("Domain=");
    const cookie = setCookie[0]!.split(";")[0]!;
    const csrf = verification.body.data.csrfToken as string;

    await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Cookie", cookie)
      .set("Origin", userOrigin)
      .expect(200)
      .expect(({ body }) => expect(body.data.email).toBe(email));
    await request(app.getHttpServer())
      .get("/api/v1/admin/audit-logs")
      .set("Cookie", cookie)
      .set("Origin", userOrigin)
      .expect(403);

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", userOrigin)
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe("CSRF_INVALID"));

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", userOrigin)
      .set("X-CSRF-Token", csrf)
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/v1/auth/session")
      .set("Cookie", cookie)
      .set("Origin", userOrigin)
      .expect(401);
  });

  it("does not disclose or send to a non-whitelisted admin email", async () => {
    const email = "e1-not-admin@example.com";
    await requestCode(email, "admin", adminOrigin).expect(202);
    expect(emailSender.messages.has(`${email}:login`)).toBe(false);
    await verifyCode(email, "123456", "admin", adminOrigin)
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe("AUTH_CODE_INVALID"));
  });

  it("creates the admin role and grants a ten minute step-up window", async () => {
    const email = "geyaovip@163.com";
    await requestCode(email, "admin", adminOrigin).expect(202);
    const loginCode = emailSender.messages.get(`${email}:login`)!.code;
    const verification = await verifyCode(
      email,
      loginCode,
      "admin",
      adminOrigin,
    ).expect(201);
    const setCookie = verification.headers["set-cookie"] as unknown as string[];
    const cookie = setCookie[0]!.split(";")[0]!;
    const csrf = verification.body.data.csrfToken as string;

    await request(app.getHttpServer())
      .post("/api/v1/auth/step-up-code-requests")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .set("X-CSRF-Token", csrf)
      .set("X-Device-Id", device)
      .expect(202);
    const stepUpCode = emailSender.messages.get(`${email}:step_up`)!.code;
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/step-up-code-verifications")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .set("X-CSRF-Token", csrf)
      .set("X-Device-Id", device)
      .send({ code: stepUpCode })
      .expect(201);
    expect(new Date(response.body.data.stepUpUntil).getTime()).toBeGreaterThan(
      Date.now(),
    );

    const auditResponse = await request(app.getHttpServer())
      .get("/api/v1/admin/audit-logs?limit=10")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .expect(200);
    expect(
      auditResponse.body.data.some(
        (item: { action: string }) => item.action === "auth.step_up",
      ),
    ).toBe(true);

    const assignment = await database.platformRoleAssignment.findFirst({
      include: { role: true, user: true },
      where: { user: { emailNormalized: email } },
    });
    expect(assignment?.role.code).toBe("super_admin");

    const dashboard = await request(app.getHttpServer())
      .get("/api/v1/admin/dashboard")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .expect(200);
    expect(dashboard.body.data).toEqual(
      expect.objectContaining({
        users: expect.any(Number),
        workspaces: expect.any(Number),
        projects: expect.any(Number),
      }),
    );

    const adminUser = await database.user.findUniqueOrThrow({
      where: { emailNormalized: email },
    });
    const lifecycleWorkspace = await database.workspace.create({
      data: {
        createdById: adminUser.id,
        id: uuidv7(),
        name: "Lifecycle API test",
        slug: `e1-lifecycle-${process.pid}-${Date.now()}`,
      },
    });
    await request(app.getHttpServer())
      .get("/api/v1/admin/data-lifecycle/legal-holds")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/admin/data-lifecycle/legal-holds")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .send({
        reason: "API integration legal review",
        scopeId: lifecycleWorkspace.id,
        scopeType: "workspace",
      })
      .expect(403);
    const legalHold = await request(app.getHttpServer())
      .post("/api/v1/admin/data-lifecycle/legal-holds")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .set("X-CSRF-Token", csrf)
      .send({
        reason: "API integration legal review",
        scopeId: lifecycleWorkspace.id,
        scopeType: "workspace",
      })
      .expect(201);
    expect(legalHold.body.data).toMatchObject({ active: true });
    await request(app.getHttpServer())
      .post(
        `/api/v1/admin/data-lifecycle/legal-holds/${legalHold.body.data.id}/release`,
      )
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .set("X-CSRF-Token", csrf)
      .expect(201)
      .expect(({ body }) => expect(body.data.active).toBe(false));
    await request(app.getHttpServer())
      .get("/api/v1/admin/users?q=geyaovip")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .expect(200);

    const agent = await request(app.getHttpServer())
      .post("/api/v1/admin/agent-runs")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .set("X-CSRF-Token", csrf)
      .send({ question: "平台概览和模型健康如何？", tokenBudget: 800 })
      .expect(201);
    expect(agent.body.data).toMatchObject({
      runtimeVersion: "2026.7.1",
      status: "succeeded",
    });
    expect(agent.body.data.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: "dashboard.read" }),
        expect.objectContaining({ skill: "model.health.read" }),
      ]),
    );
    await request(app.getHttpServer())
      .get("/api/v1/admin/agent-runs")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .expect(200);
    await database.agentRun.delete({ where: { id: agent.body.data.id } });

    const telegram = await request(app.getHttpServer())
      .put("/api/v1/admin/notification-channels/telegram")
      .set("Cookie", cookie)
      .set("Origin", adminOrigin)
      .set("X-CSRF-Token", csrf)
      .send({
        chatId: "123456789",
        enabled: false,
        token: "telegram-fixture-value-never-real",
      })
      .expect(200);
    expect(telegram.body.data).toMatchObject({
      configured: true,
      enabled: false,
    });
    expect(JSON.stringify(telegram.body)).not.toContain(
      "telegram-fixture-value-never-real",
    );
    const storedChannel =
      await database.notificationChannelConfig.findUniqueOrThrow({
        where: { code: "telegram" },
      });
    expect(storedChannel.encryptedToken).not.toContain(
      "telegram-fixture-value-never-real",
    );
    await database.notificationChannelConfig.delete({
      where: { code: "telegram" },
    });
  });

  it("enforces origin, delivery failure semantics and resend rate limiting", async () => {
    await requestCode("e1-origin@example.com", "user", "https://evil.example")
      .expect(403)
      .expect(({ body }) => expect(body.error.code).toBe("FORBIDDEN"));

    const failedEmail = "e1-delivery@example.com";
    emailSender.failNext = true;
    await requestCode(failedEmail, "user", userOrigin)
      .expect(503)
      .expect(({ body }) =>
        expect(body.error.code).toBe("EXTERNAL_DEPENDENCY_UNAVAILABLE"),
      );
    expect(
      await database.emailCodeChallenge.count({
        where: { emailNormalized: failedEmail },
      }),
    ).toBe(0);

    const limitedEmail = "e1-limited@example.com";
    await requestCode(limitedEmail, "user", userOrigin).expect(202);
    await requestCode(limitedEmail, "user", userOrigin)
      .expect(429)
      .expect(({ body }) => expect(body.error.code).toBe("RATE_LIMITED"));
  });

  it("invalidates a challenge after five failures and consumes it only once", async () => {
    const attemptsEmail = "e1-attempts@example.com";
    await requestCode(attemptsEmail, "user", userOrigin).expect(202);
    const correctCode = emailSender.messages.get(
      `${attemptsEmail}:login`,
    )!.code;
    const wrongCode = correctCode === "999999" ? "000000" : "999999";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verifyCode(attemptsEmail, wrongCode, "user", userOrigin).expect(
        401,
      );
    }
    await verifyCode(attemptsEmail, correctCode, "user", userOrigin).expect(
      401,
    );
    expect(
      await database.emailCodeChallenge.findFirst({
        where: { emailNormalized: attemptsEmail },
      }),
    ).toMatchObject({ attempts: 5, status: "invalidated" });

    const concurrentEmail = "e1-concurrent@example.com";
    await requestCode(concurrentEmail, "user", userOrigin).expect(202);
    const concurrentCode = emailSender.messages.get(
      `${concurrentEmail}:login`,
    )!.code;
    const responses = await Promise.all([
      verifyCode(concurrentEmail, concurrentCode, "user", userOrigin),
      verifyCode(concurrentEmail, concurrentCode, "user", userOrigin),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 401]);
  });

  function requestCode(
    email: string,
    audience: "user" | "admin",
    origin: string,
  ) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/email-code-requests")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience, email });
  }

  function verifyCode(
    email: string,
    code: string,
    audience: "user" | "admin",
    origin: string,
  ) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/email-code-verifications")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience, code, email });
  }
});
