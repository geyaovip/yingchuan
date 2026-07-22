import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { SESSION_COOKIE_NAME } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import { AgentService } from "./agent.service.js";

const runSchema = z.object({
  action: z
    .object({
      args: z.unknown(),
      idempotencyKey: z.string().min(8).max(200).optional(),
      skillName: z.string().min(1).max(100),
    })
    .optional(),
  projectId: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(2000),
  tokenBudget: z.number().int().min(200).max(8000).optional(),
});

@Controller("admin/agent-runs")
export class AgentController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AgentService) private readonly agent: AgentService,
  ) {}
  @Get() async list(@Req() request: Request) {
    return { data: await this.agent.list(await this.auth(request)) };
  }
  @Post() async run(@Body() body: unknown, @Req() request: Request) {
    return {
      data: await this.agent.run(
        await this.auth(request, true),
        runSchema.parse(body),
      ),
    };
  }
  private async auth(request: Request, write = false) {
    const auth = await this.authService.getSession(this.token(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    if (write) {
      this.authService.assertCsrf(
        auth,
        request.header("x-csrf-token"),
        request.header("origin") ?? "",
      );
    }
    return auth;
  }
  private token(request: Request) {
    for (const item of request.header("cookie")?.split(";") ?? []) {
      const [name, ...value] = item.trim().split("=");
      if (name === SESSION_COOKIE_NAME)
        return decodeURIComponent(value.join("="));
    }
    return undefined;
  }
}
