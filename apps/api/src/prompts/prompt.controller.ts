import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  PromptApplicationService,
  PromptServiceError,
} from "@yingchuan/prompts";
import type { Request } from "express";
import { ZodError } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import type {
  AuthenticatedSession,
  RequestIdentity,
} from "../auth/auth.types.js";
import { PROMPT_SERVICE } from "./prompt.constants.js";
import {
  generatePromptsSchema,
  importPromptsSchema,
  promptInputSchema,
  updatePromptSchema,
  variantsSchema,
} from "./prompt.schemas.js";

@Controller("projects/:projectId")
export class PromptController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PROMPT_SERVICE)
    private readonly prompts: PromptApplicationService,
  ) {}

  @Get("prompts")
  async list(@Param("projectId") projectId: string, @Req() request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.perform(() =>
        this.prompts.list(projectId, auth.user.id),
      ),
    };
  }

  @Post("prompts")
  async create(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => promptInputSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.prompts.create(projectId, input, this.actor(auth)),
      ),
    };
  }

  @Patch("prompts/:promptId")
  async update(
    @Param("projectId") projectId: string,
    @Param("promptId") promptId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => updatePromptSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.prompts.update(projectId, promptId, input, this.actor(auth)),
      ),
    };
  }

  @Delete("prompts/:promptId")
  async remove(
    @Param("projectId") projectId: string,
    @Param("promptId") promptId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.prompts.remove(projectId, promptId, this.actor(auth)),
      ),
    };
  }

  @Get("prompts/:promptId/versions")
  async versions(
    @Param("projectId") projectId: string,
    @Param("promptId") promptId: string,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.perform(() =>
        this.prompts.history(projectId, promptId, auth.user.id),
      ),
    };
  }

  @Post("prompt-generation-jobs")
  async generate(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => generatePromptsSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.prompts.generate(projectId, input, this.actor(auth)),
      ),
    };
  }

  @Post("prompts/import-actions")
  async importMany(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => importPromptsSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.prompts.importMany(projectId, input.prompts, this.actor(auth)),
      ),
    };
  }

  @Post("prompts/:promptId/variant-actions")
  async variants(
    @Param("projectId") projectId: string,
    @Param("promptId") promptId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => variantsSchema.parse(body));
    const auth = await this.writeAuth(request, csrf);
    return {
      data: await this.perform(() =>
        this.prompts.variants(
          projectId,
          promptId,
          input.count,
          this.actor(auth),
        ),
      ),
    };
  }

  private async writeAuth(request: Request, csrf: string | undefined) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    const identity = this.identity(request);
    this.authService.assertCsrf(auth, csrf, identity.origin);
    return auth;
  }

  private identity(request: Request): RequestIdentity {
    return {
      deviceId: request.header("x-device-id") ?? "session-device-unavailable",
      ip: request.ip || request.socket.remoteAddress || "unknown",
      origin: request.header("origin") ?? "",
      userAgent: request.header("user-agent") ?? "unknown",
    };
  }

  private actor(auth: AuthenticatedSession) {
    return { email: auth.user.displayEmail, userId: auth.user.id };
  }

  private sessionToken(request: Request): string | undefined {
    return readSessionToken(request, "user");
  }

  private parse<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ZodError) throw this.error("VALIDATION_FAILED", 400);
      throw error;
    }
  }

  private async perform<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PromptServiceError)
        throw new HttpException(
          {
            error: {
              code: error.code,
              details: error.similarPromptId
                ? { similarPromptId: error.similarPromptId }
                : undefined,
              message: this.message(error.code),
            },
          },
          error.status,
        );
      throw error;
    }
  }

  private error(code: string, status: 400 | 403 | 404 | 409) {
    return new HttpException(
      { error: { code, message: this.message(code) } },
      status,
    );
  }

  private message(code: string) {
    const messages: Record<string, string> = {
      CONCURRENT_MODIFICATION: "Prompt 已被其他操作更新，请刷新后重试。",
      FORBIDDEN: "没有管理 Prompt 的权限。",
      PROJECT_NOT_READY: "请先完成品牌确认，再配置 Prompt。",
      PROMPT_DUPLICATE: "存在内容相同的 Prompt。",
      PROMPT_LEADING: "Prompt 不能诱导模型给出指定结论。",
      PROMPT_SIMILAR: "存在语义高度相似的 Prompt，请确认是否仍需添加。",
      PROMPT_TEXT_INVALID: "Prompt 长度不符合要求。",
      RESOURCE_NOT_FOUND: "请求的资源不存在。",
      SCOPE_CONTEXT_REQUIRED: "该 Scope 缺少明确地域或门店信息。",
      VALIDATION_FAILED: "请求参数不符合要求。",
    };
    return messages[code] ?? "请求未能完成。";
  }
}
