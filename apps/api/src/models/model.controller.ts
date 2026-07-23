import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  ModelGatewayApplicationService,
  ModelGatewayServiceError,
} from "@yingchuan/model-gateway";
import { ZodError } from "zod";

import { SESSION_COOKIE_NAME } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthenticatedSession } from "../auth/auth.types.js";
import { MODEL_GATEWAY_SERVICE } from "./model.constants.js";
import {
  credentialSchema,
  modelConfigSchema,
  providerStatusSchema,
} from "./model.schemas.js";

@Controller()
export class ModelController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(MODEL_GATEWAY_SERVICE)
    private readonly models: ModelGatewayApplicationService,
  ) {}

  @Get("admin/model-providers")
  async providers(@Req() request: Request) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() =>
        this.models.listForAdmin(this.actor(auth)),
      ),
    };
  }

  @Get("admin/model-calls")
  async calls(
    @Query("limit") limit: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() =>
        this.models.listCallsForAdmin(this.actor(auth), Number(limit ?? 50)),
      ),
    };
  }

  @Patch("admin/model-providers/:providerId/status")
  async providerStatus(
    @Param("providerId") providerId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => providerStatusSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.models.setProviderStatus(
          providerId,
          input.status,
          this.actor(auth),
        ),
      ),
    };
  }

  @Put("admin/model-providers/:providerId/credential")
  async credential(
    @Param("providerId") providerId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => credentialSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.models.overwriteCredential(
          providerId,
          input.credential,
          this.actor(auth),
        ),
      ),
    };
  }

  @Put("admin/model-configs/:modelConfigId")
  async modelConfig(
    @Param("modelConfigId") modelConfigId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => modelConfigSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.models.updateModelConfig(modelConfigId, input, this.actor(auth)),
      ),
    };
  }

  @Post("admin/model-configs/:modelConfigId/probe")
  async probeModelConfig(
    @Param("modelConfigId") modelConfigId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.models.probeModelConfig(modelConfigId, this.actor(auth)),
      ),
    };
  }

  @Post("projects/:projectId/analysis-estimates")
  async estimate(
    @Param("projectId") projectId: string,
    @Req() request: Request,
  ) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() =>
        this.models.estimate(projectId, auth.user.id),
      ),
    };
  }

  @Post("projects/:projectId/usage-reservations")
  async reserve(
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.models.reserve(projectId, auth.user.id, idempotencyKey ?? ""),
      ),
    };
  }

  @Get("workspaces/:workspaceId/usage")
  async usage(
    @Param("workspaceId") workspaceId: string,
    @Req() request: Request,
  ) {
    const auth = await this.readAuth(request);
    return {
      data: await this.perform(() =>
        this.models.usage(workspaceId, auth.user.id),
      ),
    };
  }

  private async readAuth(request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }

  private async writeAuth(request: Request, csrf: string | undefined) {
    const auth = await this.authService.getSession(this.sessionToken(request));
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

  private sessionToken(request: Request): string | undefined {
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

  private async perform<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ModelGatewayServiceError)
        throw this.httpError(error.code, error.status);
      throw error;
    }
  }

  private httpError(code: string, status: number) {
    const messages: Record<string, string> = {
      IDEMPOTENCY_CONFLICT: "幂等键已用于不同请求。",
      IDEMPOTENCY_KEY_REQUIRED: "请提供幂等键。",
      PROJECT_NOT_READY: "项目尚未完成品牌确认。",
      PROVIDER_CREDENTIAL_REQUIRED: "请先配置火山方舟凭证。",
      PROVIDER_DISABLED: "请先启用火山方舟 Provider。",
      AUTH_STEP_UP_REQUIRED: "此操作需要完成二次邮箱验证。",
      USAGE_QUOTA_EXCEEDED: "当前工作区额度不足。",
      VALIDATION_FAILED: "请求参数不符合要求。",
    };
    return new HttpException(
      { error: { code, message: messages[code] ?? "无法完成模型配置操作。" } },
      status,
    );
  }
}
