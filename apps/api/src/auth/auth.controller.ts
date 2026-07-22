import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodError } from "zod";

import { SESSION_COOKIE_NAME } from "./auth.constants.js";
import {
  requestCodeSchema,
  stepUpVerifySchema,
  verifyCodeSchema,
} from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";
import type { RequestIdentity } from "./auth.types.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("email-code-requests")
  @HttpCode(202)
  async requestEmailCode(
    @Body() body: unknown,
    @Req() request: Request,
  ): Promise<{ data: { accepted: true } }> {
    const input = this.parse(() => requestCodeSchema.parse(body));
    await this.authService.requestLoginCode(
      input.email,
      input.audience,
      this.identity(request, true),
    );
    return { data: { accepted: true } };
  }

  @Post("email-code-verifications")
  async verifyEmailCode(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = this.parse(() => verifyCodeSchema.parse(body));
    const session = await this.authService.verifyLoginCode(
      input.email,
      input.code,
      input.audience,
      this.identity(request, true),
    );
    response.cookie(SESSION_COOKIE_NAME, session.rawSessionToken, {
      httpOnly: true,
      maxAge: session.session.expiresAt.getTime() - Date.now(),
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    return { data: this.authService.toSessionView(session) };
  }

  @Get("session")
  async getSession(@Req() request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return { data: this.authService.toSessionView(auth) };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Headers("x-csrf-token") csrfToken: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const auth = await this.authService.getSession(this.sessionToken(request));
    const identity = this.identity(request, false);
    this.authService.assertCsrf(auth, csrfToken, identity.origin);
    await this.authService.logout(auth, identity);
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  }

  @Post("step-up-code-requests")
  @HttpCode(202)
  async requestStepUpCode(
    @Headers("x-csrf-token") csrfToken: string | undefined,
    @Req() request: Request,
  ): Promise<{ data: { accepted: true } }> {
    const auth = await this.authService.getSession(this.sessionToken(request));
    const identity = this.identity(request, true);
    this.authService.assertCsrf(auth, csrfToken, identity.origin);
    await this.authService.requestStepUpCode(auth, identity);
    return { data: { accepted: true } };
  }

  @Post("step-up-code-verifications")
  async verifyStepUpCode(
    @Body() body: unknown,
    @Headers("x-csrf-token") csrfToken: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => stepUpVerifySchema.parse(body));
    const auth = await this.authService.getSession(this.sessionToken(request));
    const identity = this.identity(request, true);
    this.authService.assertCsrf(auth, csrfToken, identity.origin);
    const stepUpUntil = await this.authService.verifyStepUpCode(
      auth,
      input.code,
      identity,
    );
    return { data: { stepUpUntil: stepUpUntil.toISOString() } };
  }

  private identity(request: Request, requireDevice: boolean): RequestIdentity {
    const deviceId =
      request.header("x-device-id") ?? "session-device-unavailable";
    if (requireDevice && !/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      throw this.validationError();
    }
    const origin = request.header("origin") ?? "";
    if (!origin) throw this.validationError();
    return {
      deviceId,
      ip: request.ip || request.socket.remoteAddress || "unknown",
      origin,
      userAgent: request.header("user-agent") ?? "unknown",
    };
  }

  private sessionToken(request: Request): string | undefined {
    const cookies = request.header("cookie")?.split(";") ?? [];
    for (const item of cookies) {
      const [name, ...value] = item.trim().split("=");
      if (name === SESSION_COOKIE_NAME)
        return decodeURIComponent(value.join("="));
    }
    return undefined;
  }

  private parse<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ZodError) throw this.validationError();
      throw error;
    }
  }

  private validationError(): HttpException {
    return new HttpException(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "请求参数不符合要求。",
        },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
