import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { SESSION_COOKIE_NAME } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import { AuditService } from "./audit.service.js";

@Controller("admin/audit-logs")
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async list(
    @Query("limit") limitInput: string | undefined,
    @Query("workspaceId") workspaceId: string | undefined,
    @Query("action") action: string | undefined,
    @Query("actorId") actorId: string | undefined,
    @Query("objectType") objectType: string | undefined,
    @Query("outcome") outcome: string | undefined,
    @Query("requestId") requestId: string | undefined,
    @Query("riskLevel") riskLevel: string | undefined,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    const parsedLimit = Number(limitInput ?? 50);
    const limit = Number.isInteger(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : 50;
    return {
      data: await this.auditService.listForAdmin(auth, {
        limit,
        ...(workspaceId ? { workspaceId } : {}),
        ...(action ? { action } : {}),
        ...(actorId ? { actorId } : {}),
        ...(objectType ? { objectType } : {}),
        ...(outcome ? { outcome } : {}),
        ...(requestId ? { requestId } : {}),
        ...(riskLevel ? { riskLevel } : {}),
      }),
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
}
