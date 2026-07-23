import {
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { ReportApplicationService } from "@yingchuan/reports";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import { REPORT_SERVICE } from "./report.constants.js";

@Controller("projects/:projectId/reports")
export class ReportController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(REPORT_SERVICE) private readonly reports: ReportApplicationService,
  ) {}

  @Get()
  async list(@Param("projectId") projectId: string, @Req() request: Request) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() =>
        this.reports.list(projectId, auth.user.id),
      ),
    };
  }

  @Get(":versionId")
  async detail(
    @Param("projectId") projectId: string,
    @Param("versionId") versionId: string,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() =>
        this.reports.detail(
          projectId,
          versionId,
          auth.user.id,
          request.header("x-request-id"),
        ),
      ),
    };
  }

  @Post(":versionId/:action")
  async transition(
    @Param("projectId") projectId: string,
    @Param("versionId") versionId: string,
    @Param("action") action: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    if (action !== "publish" && action !== "archive")
      throw new HttpException(
        { error: { code: "RESOURCE_NOT_FOUND", message: "操作不存在。" } },
        404,
      );
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return {
      data: await this.perform(() =>
        this.reports.transition(projectId, versionId, action, auth.user.id),
      ),
    };
  }

  private async auth(request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }
  private sessionToken(request: Request) {
    return readSessionToken(request, "user");
  }
  private async perform<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const raw = error instanceof Error ? error.message : "REPORT_FAILED";
      const code = ["RESOURCE_NOT_FOUND", "INVALID_STATE_TRANSITION"].includes(
        raw,
      )
        ? raw
        : "REPORT_FAILED";
      throw new HttpException(
        { error: { code, message: "无法完成报告操作。" } },
        code === "RESOURCE_NOT_FOUND"
          ? 404
          : code === "INVALID_STATE_TRANSITION"
            ? 409
            : 500,
      );
    }
  }
}
