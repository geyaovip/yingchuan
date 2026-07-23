import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service.js";

const identity = {
  deviceId: "local_auth_test_device",
  ip: "127.0.0.1",
  origin: "http://localhost:5173",
  userAgent: "vitest",
};

const originalEnvironment = {
  adminAllowedEmails: process.env.ADMIN_ALLOWED_EMAILS,
  authLocalCodeDelivery: process.env.AUTH_LOCAL_CODE_DELIVERY,
  authPepper: process.env.AUTH_PEPPER,
  nodeEnvironment: process.env.NODE_ENV,
};

afterEach(() => {
  restoreEnvironment(
    "ADMIN_ALLOWED_EMAILS",
    originalEnvironment.adminAllowedEmails,
  );
  restoreEnvironment(
    "AUTH_LOCAL_CODE_DELIVERY",
    originalEnvironment.authLocalCodeDelivery,
  );
  restoreEnvironment("AUTH_PEPPER", originalEnvironment.authPepper);
  restoreEnvironment("NODE_ENV", originalEnvironment.nodeEnvironment);
});

describe("local development code delivery", () => {
  it("creates a hashed challenge without calling Resend in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.AUTH_LOCAL_CODE_DELIVERY = "true";
    process.env.AUTH_PEPPER = "local_test_pepper_at_least_32_characters";
    process.env.ADMIN_ALLOWED_EMAILS = "geyaovip@163.com";
    const { challengeCreate, emailSender, rateLimiter, service } =
      createService();

    const result = await service.requestLoginCode(
      "dev-user@example.com",
      "user",
      identity,
    );

    expect(result.developmentCode).toMatch(/^\d{6}$/u);
    expect(emailSender.sendCode).not.toHaveBeenCalled();
    expect(challengeCreate).toHaveBeenCalledOnce();
    const challenge = challengeCreate.mock.calls[0]![0].data;
    expect(challenge.codeHash).not.toBe(result.developmentCode);
    expect(challenge.codeHash).toHaveLength(64);
    expect(challenge.resendMessageId).toMatch(/^local-development\//u);
    expect(rateLimiter.consume).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: expect.stringContaining("login:user:"),
        }),
      ]),
    );
  });

  it("does not expose a code or bypass Resend outside development", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_LOCAL_CODE_DELIVERY = "true";
    process.env.AUTH_PEPPER = "production_test_pepper_at_least_32_chars";
    process.env.ADMIN_ALLOWED_EMAILS = "geyaovip@163.com";
    const { challengeCreate, emailSender, service } = createService();

    const result = await service.requestLoginCode(
      "production-user@example.com",
      "user",
      { ...identity, origin: "https://app.chatway.chat" },
    );

    expect(result).toEqual({});
    expect(emailSender.sendCode).toHaveBeenCalledOnce();
    expect(challengeCreate.mock.calls[0]![0].data.resendMessageId).toBe(
      "resend-test-message",
    );
  });
});

function createService() {
  const challengeCreate = vi.fn().mockResolvedValue({});
  const database = {
    emailCodeChallenge: { create: challengeCreate },
  };
  const emailSender = {
    sendCode: vi.fn().mockResolvedValue("resend-test-message"),
    sendWorkspaceInvitation: vi
      .fn()
      .mockResolvedValue("resend-test-invitation"),
  };
  const rateLimiter = {
    consume: vi.fn().mockResolvedValue(true),
  };
  const service = new AuthService(
    database as never,
    emailSender,
    rateLimiter as never,
  );
  return { challengeCreate, emailSender, rateLimiter, service };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
