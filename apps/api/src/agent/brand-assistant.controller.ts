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
import type { Request } from "express";
import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import { BrandAssistantService } from "./brand-assistant.service.js";

const runSchema = z
  .object({
    question: z.string().trim().min(1).max(2000),
    tokenBudget: z.number().int().min(200).max(4000).optional(),
  })
  .strict();
const idSchema = z.string().uuid();

@Controller("projects/:projectId/assistant/runs")
export class BrandAssistantController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(BrandAssistantService)
    private readonly assistant: BrandAssistantService,
  ) {}

  @Get()
  async list(
    @Param("projectId") rawProjectId: string,
    @Headers("x-workspace-id") rawWorkspaceId: string | undefined,
    @Req() request: Request,
  ) {
    return {
      data: await this.assistant.list(
        await this.auth(request, false),
        this.parse(() => idSchema.parse(rawWorkspaceId)),
        this.parse(() => idSchema.parse(rawProjectId)),
      ),
    };
  }

  @Post()
  async run(
    @Param("projectId") rawProjectId: string,
    @Headers("x-workspace-id") rawWorkspaceId: string | undefined,
    @Body() body: unknown,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request, true);
    this.authService.assertCsrf(
      auth,
      request.header("x-csrf-token"),
      request.header("origin") ?? "",
    );
    return {
      data: await this.assistant.run(
        auth,
        this.parse(() => idSchema.parse(rawWorkspaceId)),
        this.parse(() => idSchema.parse(rawProjectId)),
        this.parse(() => runSchema.parse(body)),
      ),
    };
  }

  private async auth(request: Request, requireOrigin: boolean) {
    const auth = await this.authService.getSession(this.token(request));
    if (requireOrigin)
      this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }

  private token(request: Request) {
    return readSessionToken(request, "user");
  }

  private parse<T>(operation: () => T): T {
    try {
      return operation();
    } catch {
      throw new HttpException(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "品牌管家请求参数不正确。",
          },
        },
        400,
      );
    }
  }
}
