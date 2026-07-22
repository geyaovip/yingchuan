import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createDatabaseClient } from "@yingchuan/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.js";
import { configureApi } from "../configure-api.js";
import { EMAIL_SENDER } from "../auth/auth.constants.js";
import type { EmailSender, SendCodeInput } from "../auth/email-sender.js";

class WorkspaceEmailSender implements EmailSender {
  readonly codes = new Map<string, string>();
  readonly invitationTokens = new Map<string, string>();

  sendCode(input: SendCodeInput): Promise<string> {
    this.codes.set(input.email, input.code);
    return Promise.resolve(`code-${this.codes.size}`);
  }

  sendWorkspaceInvitation(input: {
    email: string;
    token: string;
  }): Promise<string> {
    this.invitationTokens.set(input.email, input.token);
    return Promise.resolve(`invite-${this.invitationTokens.size}`);
  }
}

interface LoginContext {
  cookie: string;
  csrf: string;
}

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const database = createDatabaseClient(databaseUrl);
const origin = "https://app.chatway.chat";
const device = "workspace_test_device";

describe("workspace isolation and RBAC", () => {
  let app: INestApplication;
  let emailSender: WorkspaceEmailSender;
  let owner: LoginContext;
  let member: LoginContext;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_PEPPER = "workspace_test_pepper_at_least_32_chars";
    process.env.AUTH_RATE_LIMIT_PREFIX = `workspace-auth-${process.pid}-${Date.now()}`;
    emailSender = new WorkspaceEmailSender();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.init();
    owner = await login("ws-owner@example.com");
    member = await login("ws-member@example.com");
  });

  afterAll(async () => {
    const users = await database.user.findMany({
      select: { id: true },
      where: { emailNormalized: { startsWith: "ws-" } },
    });
    const userIds = users.map(({ id }) => id);
    await database.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await database.workspaceInvitation.deleteMany({
      where: { emailNormalized: { startsWith: "ws-" } },
    });
    await database.workspace.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await database.emailCodeChallenge.deleteMany({
      where: { emailNormalized: { startsWith: "ws-" } },
    });
    await database.user.deleteMany({
      where: { emailNormalized: { startsWith: "ws-" } },
    });
    await app.close();
    await database.$disconnect();
  });

  it("requires CSRF and hides a workspace from non-members", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/workspaces")
      .set("Cookie", owner.cookie)
      .set("Origin", origin)
      .send({ name: "Missing CSRF" })
      .expect(403);

    const workspace = await createWorkspace("租户隔离测试", owner);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}`)
      .set("Cookie", member.cookie)
      .set("Origin", origin)
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe("RESOURCE_NOT_FOUND"));
  });

  it("supports invitation acceptance without returning the raw token", async () => {
    const workspace = await createWorkspace("邀请测试", owner);
    const invitation = await write(owner)
      .post(`/api/v1/workspaces/${workspace.id}/invitations`)
      .send({ email: "ws-member@example.com", roleCode: "viewer" })
      .expect(201);
    expect(invitation.body.data.token).toBeUndefined();
    const inviteCode = emailSender.invitationTokens.get(
      "ws-member@example.com",
    )!;

    await write(member)
      .post("/api/v1/workspace-invitations/accept-actions")
      .send({ token: inviteCode })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get("/api/v1/workspaces")
      .set("Cookie", member.cookie)
      .set("Origin", origin)
      .expect(200);
    expect(
      list.body.data.some((item: { id: string }) => item.id === workspace.id),
    ).toBe(true);

    await write(member)
      .patch(`/api/v1/workspaces/${workspace.id}`)
      .send({ name: "越权修改", version: workspace.version })
      .expect(403);
  });

  it("enforces the permission matrix, optimistic version and last-owner protection", async () => {
    const workspace = await createWorkspace("角色保护测试", owner);
    const members = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspace.id}/members`)
      .set("Cookie", owner.cookie)
      .set("Origin", origin)
      .expect(200);
    const ownerMembership = members.body.data[0];

    await write(owner)
      .patch(`/api/v1/workspaces/${workspace.id}/members/${ownerMembership.id}`)
      .send({ roleCode: "admin", version: ownerMembership.version })
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.code).toBe("LAST_OWNER_REQUIRED"),
      );

    await write(owner)
      .patch(`/api/v1/workspaces/${workspace.id}`)
      .send({ name: "已更新名称", version: workspace.version })
      .expect(200);
    await write(owner)
      .patch(`/api/v1/workspaces/${workspace.id}`)
      .send({ name: "陈旧版本", version: workspace.version })
      .expect(409)
      .expect(({ body }) =>
        expect(body.error.code).toBe("CONCURRENT_MODIFICATION"),
      );

    expect(
      await database.auditLog.count({
        where: { actorId: ownerMembership.user.id, workspaceId: workspace.id },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  async function login(email: string): Promise<LoginContext> {
    await request(app.getHttpServer())
      .post("/api/v1/auth/email-code-requests")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience: "user", email })
      .expect(202);
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/email-code-verifications")
      .set("Origin", origin)
      .set("X-Device-Id", device)
      .send({ audience: "user", code: emailSender.codes.get(email), email })
      .expect(201);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    return {
      cookie: cookies[0]!.split(";")[0]!,
      csrf: response.body.data.csrfToken as string,
    };
  }

  async function createWorkspace(name: string, context: LoginContext) {
    const response = await write(context)
      .post("/api/v1/workspaces")
      .send({ name })
      .expect(201);
    return response.body.data as { id: string; version: number };
  }

  function write(context: LoginContext) {
    return {
      patch: (path: string) =>
        request(app.getHttpServer())
          .patch(path)
          .set("Cookie", context.cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", context.csrf),
      post: (path: string) =>
        request(app.getHttpServer())
          .post(path)
          .set("Cookie", context.cookie)
          .set("Origin", origin)
          .set("X-CSRF-Token", context.csrf),
    };
  }
});
