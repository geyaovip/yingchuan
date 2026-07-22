import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  AuditOutcome,
  AuthAudience,
  ChallengePurpose,
  ChallengeStatus,
  RoleScope,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { v7 as uuidv7 } from "uuid";

import { DATABASE_CLIENT } from "../database/database.constants.js";
import { AUTH_ORIGINS, EMAIL_SENDER } from "./auth.constants.js";
import { AuthRateLimiter } from "./auth-rate-limiter.js";
import type { AuthAudienceInput } from "./auth.schemas.js";
import type { EmailSender } from "./email-sender.js";
import type {
  AuthenticatedSession,
  CreatedSession,
  RequestIdentity,
  SessionView,
} from "./auth.types.js";

const challengeTtlMs = 10 * 60 * 1000;
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const stepUpTtlMs = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly allowedAdminEmails: ReadonlySet<string>;
  private readonly pepper: string;

  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    private readonly rateLimiter: AuthRateLimiter,
  ) {
    this.pepper = getRuntimeValue("AUTH_PEPPER", {
      fallback: "yingchuan_local_auth_pepper_change_before_production",
    });
    this.allowedAdminEmails = new Set(
      getRuntimeValue("ADMIN_ALLOWED_EMAILS", {
        fallback: "geyaovip@163.com",
      })
        .split(",")
        .map((email) => this.normalizeEmail(email))
        .filter(Boolean),
    );
    if (this.allowedAdminEmails.size === 0) {
      throw new Error("ADMIN_ALLOWED_EMAILS is required.");
    }
  }

  async requestLoginCode(
    emailInput: string,
    audienceInput: AuthAudienceInput,
    identity: RequestIdentity,
  ): Promise<void> {
    const email = this.normalizeEmail(emailInput);
    const audience = this.toAudience(audienceInput);
    this.assertOrigin(audienceInput, identity.origin);
    await this.assertRateLimit("login", email, identity);

    if (
      audience === AuthAudience.admin &&
      !this.allowedAdminEmails.has(email)
    ) {
      return;
    }
    await this.createAndSendChallenge(
      email,
      audience,
      ChallengePurpose.login,
      identity,
    );
  }

  async verifyLoginCode(
    emailInput: string,
    code: string,
    audienceInput: AuthAudienceInput,
    identity: RequestIdentity,
  ): Promise<CreatedSession> {
    const email = this.normalizeEmail(emailInput);
    const audience = this.toAudience(audienceInput);
    this.assertOrigin(audienceInput, identity.origin);
    if (
      audience === AuthAudience.admin &&
      !this.allowedAdminEmails.has(email)
    ) {
      throw this.authError("AUTH_CODE_INVALID", HttpStatus.UNAUTHORIZED);
    }

    const challenge = await this.verifyChallenge(
      email,
      code,
      audience,
      ChallengePurpose.login,
      identity,
    );
    const rawSessionToken = randomBytes(32).toString("base64url");
    const rawCsrfToken = this.deriveCsrf(rawSessionToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionTtlMs);

    const result = await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.emailCodeChallenge.updateMany({
        data: { consumedAt: now, status: ChallengeStatus.consumed },
        where: { id: challenge.id, status: ChallengeStatus.pending },
      });
      if (consumed.count !== 1) {
        throw this.authError("AUTH_CODE_INVALID", HttpStatus.UNAUTHORIZED);
      }
      const user = await transaction.user.upsert({
        create: {
          displayEmail: emailInput.trim(),
          emailNormalized: email,
          id: uuidv7(),
          lastLoginAt: now,
        },
        update: { lastLoginAt: now },
        where: { emailNormalized: email },
      });
      if (audience === AuthAudience.admin) {
        const role = await transaction.role.upsert({
          create: {
            code: "super_admin",
            description: "平台超级管理员",
            id: uuidv7(),
            scope: RoleScope.platform,
          },
          update: {},
          where: {
            scope_code: { code: "super_admin", scope: RoleScope.platform },
          },
        });
        await transaction.platformRoleAssignment.upsert({
          create: { id: uuidv7(), roleId: role.id, userId: user.id },
          update: {},
          where: { userId_roleId: { roleId: role.id, userId: user.id } },
        });
      }
      const session = await transaction.authSession.create({
        data: {
          audience,
          csrfHash: this.hash(rawCsrfToken),
          expiresAt,
          id: uuidv7(),
          ipHash: this.hash(identity.ip),
          origin: identity.origin,
          tokenHash: this.hash(rawSessionToken),
          userAgentHash: this.hash(identity.userAgent),
          userId: user.id,
        },
      });
      await this.appendAudit(transaction, {
        action: "auth.login",
        actorId: user.id,
        identity,
        objectId: session.id,
        objectType: "AuthSession",
        outcome: AuditOutcome.success,
        sessionId: session.id,
      });
      return { session, user };
    });

    return { ...result, rawCsrfToken, rawSessionToken };
  }

  async getSession(
    rawToken: string | undefined,
  ): Promise<AuthenticatedSession> {
    if (!rawToken)
      throw this.authError("AUTH_REQUIRED", HttpStatus.UNAUTHORIZED);
    const session = await this.database.authSession.findUnique({
      include: { user: true },
      where: { tokenHash: this.hash(rawToken) },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== "active"
    ) {
      throw this.authError("AUTH_REQUIRED", HttpStatus.UNAUTHORIZED);
    }
    return {
      rawCsrfToken: this.deriveCsrf(rawToken),
      session,
      user: session.user,
    };
  }

  toSessionView(auth: AuthenticatedSession): SessionView {
    return {
      audience: auth.session.audience,
      csrfToken: auth.rawCsrfToken,
      email: auth.user.displayEmail,
      expiresAt: auth.session.expiresAt.toISOString(),
      ...(auth.session.stepUpUntil
        ? { stepUpUntil: auth.session.stepUpUntil.toISOString() }
        : {}),
      userId: auth.user.id,
    };
  }

  assertCsrf(
    auth: AuthenticatedSession,
    csrfToken: string | undefined,
    origin: string,
  ): void {
    if (
      !csrfToken ||
      origin !== auth.session.origin ||
      !this.safeEqual(this.hash(csrfToken), auth.session.csrfHash)
    ) {
      throw this.authError("CSRF_INVALID", HttpStatus.FORBIDDEN);
    }
  }

  assertSessionOrigin(
    auth: AuthenticatedSession,
    origin: string | undefined,
  ): void {
    if (!origin || origin !== auth.session.origin) {
      throw this.authError("FORBIDDEN", HttpStatus.FORBIDDEN);
    }
  }

  async logout(
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.authSession.update({
        data: { revokedAt: new Date() },
        where: { id: auth.session.id },
      });
      await this.appendAudit(transaction, {
        action: "auth.logout",
        actorId: auth.user.id,
        identity,
        objectId: auth.session.id,
        objectType: "AuthSession",
        outcome: AuditOutcome.success,
        sessionId: auth.session.id,
      });
    });
  }

  async requestStepUpCode(
    auth: AuthenticatedSession,
    identity: RequestIdentity,
  ): Promise<void> {
    this.assertAdminSession(auth, identity.origin);
    await this.assertRateLimit("step-up", auth.user.emailNormalized, identity);
    await this.createAndSendChallenge(
      auth.user.emailNormalized,
      AuthAudience.admin,
      ChallengePurpose.step_up,
      identity,
      auth.session.id,
    );
  }

  async verifyStepUpCode(
    auth: AuthenticatedSession,
    code: string,
    identity: RequestIdentity,
  ): Promise<Date> {
    this.assertAdminSession(auth, identity.origin);
    const challenge = await this.verifyChallenge(
      auth.user.emailNormalized,
      code,
      AuthAudience.admin,
      ChallengePurpose.step_up,
      identity,
      auth.session.id,
    );
    const stepUpUntil = new Date(Date.now() + stepUpTtlMs);
    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.emailCodeChallenge.updateMany({
        data: { consumedAt: new Date(), status: ChallengeStatus.consumed },
        where: { id: challenge.id, status: ChallengeStatus.pending },
      });
      if (consumed.count !== 1) {
        throw this.authError("AUTH_CODE_INVALID", HttpStatus.UNAUTHORIZED);
      }
      await transaction.authSession.update({
        data: { stepUpUntil },
        where: { id: auth.session.id },
      });
      await this.appendAudit(transaction, {
        action: "auth.step_up",
        actorId: auth.user.id,
        identity,
        objectId: auth.session.id,
        objectType: "AuthSession",
        outcome: AuditOutcome.success,
        sessionId: auth.session.id,
      });
    });
    return stepUpUntil;
  }

  private async createAndSendChallenge(
    email: string,
    audience: AuthAudience,
    purpose: ChallengePurpose,
    identity: RequestIdentity,
    sessionId?: string,
  ): Promise<void> {
    const id = uuidv7();
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    let resendMessageId: string;
    try {
      resendMessageId = await this.emailSender.sendCode({
        code,
        email,
        idempotencyKey: `email-code/${id}`,
        purpose,
      });
    } catch {
      throw this.authError(
        "EXTERNAL_DEPENDENCY_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await this.database.emailCodeChallenge.create({
      data: {
        audience,
        codeHash: this.hash(code),
        deviceHash: this.hash(identity.deviceId),
        emailNormalized: email,
        expiresAt: new Date(Date.now() + challengeTtlMs),
        id,
        ipHash: this.hash(identity.ip),
        purpose,
        resendMessageId,
        sessionId,
      },
    });
  }

  private async verifyChallenge(
    email: string,
    code: string,
    audience: AuthAudience,
    purpose: ChallengePurpose,
    identity: RequestIdentity,
    sessionId?: string,
  ) {
    const challenge = await this.database.emailCodeChallenge.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        audience,
        emailNormalized: email,
        purpose,
        sessionId: sessionId ?? null,
        status: ChallengeStatus.pending,
      },
    });
    if (!challenge || challenge.deviceHash !== this.hash(identity.deviceId)) {
      throw this.authError("AUTH_CODE_INVALID", HttpStatus.UNAUTHORIZED);
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.database.emailCodeChallenge.update({
        data: { status: ChallengeStatus.invalidated },
        where: { id: challenge.id },
      });
      throw this.authError("AUTH_CODE_EXPIRED", HttpStatus.UNAUTHORIZED);
    }
    if (!this.safeEqual(challenge.codeHash, this.hash(code))) {
      const attempts = challenge.attempts + 1;
      await this.database.emailCodeChallenge.update({
        data: {
          attempts,
          ...(attempts >= 5 ? { status: ChallengeStatus.invalidated } : {}),
        },
        where: { id: challenge.id },
      });
      throw this.authError("AUTH_CODE_INVALID", HttpStatus.UNAUTHORIZED);
    }
    return challenge;
  }

  private async assertRateLimit(
    scope: "login" | "step-up",
    email: string,
    identity: RequestIdentity,
  ): Promise<void> {
    const allowed = await this.rateLimiter.consume([
      {
        key: `${scope}:email-minute:${this.hash(email)}`,
        limit: 1,
        ttlMs: 60_000,
      },
      {
        key: `${scope}:email-hour:${this.hash(email)}`,
        limit: 5,
        ttlMs: 3_600_000,
      },
      {
        key: `${scope}:email-day:${this.hash(email)}`,
        limit: 20,
        ttlMs: 86_400_000,
      },
      {
        key: `${scope}:ip-hour:${this.hash(identity.ip)}`,
        limit: 30,
        ttlMs: 3_600_000,
      },
      {
        key: `${scope}:device-hour:${this.hash(identity.deviceId)}`,
        limit: 10,
        ttlMs: 3_600_000,
      },
    ]);
    if (!allowed)
      throw this.authError("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
  }

  private assertAdminSession(auth: AuthenticatedSession, origin: string): void {
    if (
      auth.session.audience !== AuthAudience.admin ||
      !this.isAllowedOrigin("admin", origin)
    ) {
      throw this.authError("FORBIDDEN", HttpStatus.FORBIDDEN);
    }
  }

  private assertOrigin(audience: AuthAudienceInput, origin: string): void {
    if (!this.isAllowedOrigin(audience, origin)) {
      throw this.authError("FORBIDDEN", HttpStatus.FORBIDDEN);
    }
  }

  private isAllowedOrigin(
    audience: AuthAudienceInput,
    origin: string,
  ): boolean {
    if (origin === AUTH_ORIGINS[audience]) return true;
    if (process.env.NODE_ENV !== "development") return false;
    const port = audience === "admin" ? "5174" : "5173";
    return (
      origin === `http://localhost:${port}` ||
      origin === `http://127.0.0.1:${port}`
    );
  }

  private toAudience(audience: AuthAudienceInput): AuthAudience {
    return audience === "admin" ? AuthAudience.admin : AuthAudience.user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hash(value: string): string {
    return createHmac("sha256", this.pepper).update(value).digest("hex");
  }

  private deriveCsrf(rawSessionToken: string): string {
    return createHmac("sha256", this.pepper)
      .update(`csrf:${rawSessionToken}`)
      .digest("base64url");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private authError(code: string, status: HttpStatus): HttpException {
    const message =
      code === "RATE_LIMITED"
        ? "请求过于频繁，请稍后再试。"
        : code === "EXTERNAL_DEPENDENCY_UNAVAILABLE"
          ? "验证码暂时无法发送，请稍后再试。"
          : "无法完成认证，请检查信息后重试。";
    return new HttpException({ error: { code, message } }, status);
  }

  private async appendAudit(
    transaction: Prisma.TransactionClient,
    input: {
      action: string;
      actorId: string;
      identity: RequestIdentity;
      objectId: string;
      objectType: string;
      outcome: AuditOutcome;
      sessionId: string;
    },
  ): Promise<void> {
    const context = getRequestContext();
    await transaction.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId,
        actorType: "user",
        id: uuidv7(),
        ipHash: this.hash(input.identity.ip),
        objectId: input.objectId,
        objectType: input.objectType,
        outcome: input.outcome,
        requestId: context?.requestId ?? "req_background",
        riskLevel: input.action === "auth.step_up" ? "high" : "low",
        sessionId: input.sessionId,
        traceId: context?.traceId ?? "0".repeat(32),
      },
    });
  }
}
