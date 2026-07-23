import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { UserStatus } from "@yingchuan/database";
import type { Request } from "express";
import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly admin: AdminService,
  ) {}
  @Get("dashboard") async dashboard(@Req() request: Request) {
    return { data: await this.admin.dashboard(await this.auth(request)) };
  }
  @Get("users") async users(
    @Query("q") query: string | undefined,
    @Req() request: Request,
  ) {
    return { data: await this.admin.users(await this.auth(request), query) };
  }
  @Get("projects") async projects(
    @Query("q") query: string | undefined,
    @Req() request: Request,
  ) {
    return { data: await this.admin.projects(await this.auth(request), query) };
  }
  @Get("tasks") async tasks(
    @Query("status") status: string | undefined,
    @Req() request: Request,
  ) {
    return { data: await this.admin.tasks(await this.auth(request), status) };
  }
  @Patch("users/:userId/status") async userStatus(
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    const input = z.object({ status: z.enum(UserStatus) }).parse(body);
    return { data: await this.admin.setUserStatus(auth, userId, input.status) };
  }
  @Post("workspaces/:workspaceId/quota-adjustments") async quota(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    const input = z
      .object({
        quantityMicros: z.string().regex(/^-?\d+$/u),
        reason: z.string().trim().min(3).max(200),
      })
      .parse(body);
    return {
      data: await this.admin.adjustQuota(
        auth,
        workspaceId,
        BigInt(input.quantityMicros),
        input.reason,
      ),
    };
  }
  private async auth(request: Request) {
    const auth = await this.authService.getSession(this.token(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }
  private token(request: Request) {
    return readSessionToken(request, "admin");
  }
}
