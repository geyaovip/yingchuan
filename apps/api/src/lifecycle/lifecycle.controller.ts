import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  DataLifecycleApplicationService,
  DataLifecycleError,
} from "@yingchuan/data-lifecycle";
import { LegalHoldScopeType } from "@yingchuan/database";
import type { Request } from "express";
import { z, ZodError } from "zod";

import { SESSION_COOKIE_NAME } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthenticatedSession } from "../auth/auth.types.js";
import { DATA_LIFECYCLE_SERVICE } from "./lifecycle.constants.js";

const legalHoldSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  scopeId: z.uuid(),
  scopeType: z.enum(LegalHoldScopeType),
});

@Controller("admin/data-lifecycle")
export class LifecycleController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(DATA_LIFECYCLE_SERVICE)
    private readonly lifecycle: DataLifecycleApplicationService,
  ) {}

  @Get("legal-holds")
  async list(@Req() request: Request) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() =>
        this.lifecycle.listLegalHolds(this.actor(auth)),
      ),
    };
  }

  @Post("legal-holds")
  async create(
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => legalHoldSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.lifecycle.createLegalHold(input, this.actor(auth)),
      ),
    };
  }

  @Post("legal-holds/:holdId/release")
  async release(
    @Param("holdId") rawHoldId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const holdId = this.parse(() => z.uuid().parse(rawHoldId));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.lifecycle.releaseLegalHold(holdId, this.actor(auth)),
      ),
    };
  }

  private async readAuth(request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }

  private async writeAuth(request: Request, csrf: string | undefined) {
    const auth = await this.readAuth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return auth;
  }

  private actor(auth: AuthenticatedSession) {
    return {
      audience: auth.session.audience,
      email: auth.user.displayEmail,
      stepUpUntil: auth.session.stepUpUntil,
      userId: auth.user.id,
    };
  }

  private sessionToken(request: Request) {
    for (const item of request.header("cookie")?.split(";") ?? []) {
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
      if (error instanceof ZodError)
        throw this.httpError("VALIDATION_FAILED", 400);
      throw error;
    }
  }

  private async perform<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof DataLifecycleError)) throw error;
      const status =
        error.code === "LEGAL_HOLD_NOT_FOUND" ||
        error.code === "LEGAL_HOLD_SCOPE_NOT_FOUND"
          ? 404
          : error.code === "FORBIDDEN" || error.code === "AUTH_STEP_UP_REQUIRED"
            ? 403
            : 400;
      throw this.httpError(error.code, status);
    }
  }

  private httpError(code: string, status: number) {
    return new HttpException(
      { error: { code, message: "无法完成数据保留操作，请检查后重试。" } },
      status,
    );
  }
}
