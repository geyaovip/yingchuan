import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { ZodError } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import type { RequestIdentity } from "../auth/auth.types.js";
import {
  acceptInvitationSchema,
  createWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
} from "./workspace.schemas.js";
import { WorkspaceService } from "./workspace.service.js";

@Controller()
export class WorkspaceController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  @Post("workspaces")
  async create(
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => createWorkspaceSchema.parse(body));
    const { auth, identity } = await this.writeContext(request, csrf);
    return {
      data: await this.workspaceService.create(input.name, auth, identity),
    };
  }

  @Get("workspaces")
  async list(@Req() request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return { data: await this.workspaceService.list(auth) };
  }

  @Get("workspaces/:workspaceId")
  async get(
    @Param("workspaceId") workspaceId: string,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return { data: await this.workspaceService.get(workspaceId, auth) };
  }

  @Patch("workspaces/:workspaceId")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => updateWorkspaceSchema.parse(body));
    const { auth, identity } = await this.writeContext(request, csrf);
    return {
      data: await this.workspaceService.update(
        workspaceId,
        input.name,
        input.version,
        auth,
        identity,
      ),
    };
  }

  @Get("workspaces/:workspaceId/members")
  async members(
    @Param("workspaceId") workspaceId: string,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return { data: await this.workspaceService.listMembers(workspaceId, auth) };
  }

  @Post("workspaces/:workspaceId/invitations")
  async invite(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => inviteMemberSchema.parse(body));
    const { auth, identity } = await this.writeContext(request, csrf);
    return {
      data: await this.workspaceService.invite(
        workspaceId,
        input.email,
        input.roleCode,
        auth,
        identity,
      ),
    };
  }

  @Get("workspaces/:workspaceId/invitations")
  async invitations(
    @Param("workspaceId") workspaceId: string,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.workspaceService.listInvitations(workspaceId, auth),
    };
  }

  @Post("workspace-invitations/accept-actions")
  async acceptInvitation(
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => acceptInvitationSchema.parse(body));
    const { auth, identity } = await this.writeContext(request, csrf);
    return {
      data: await this.workspaceService.acceptInvitation(
        input.token,
        auth,
        identity,
      ),
    };
  }

  @Patch("workspaces/:workspaceId/members/:memberId")
  async changeRole(
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => updateMemberSchema.parse(body));
    const { auth, identity } = await this.writeContext(request, csrf);
    return {
      data: await this.workspaceService.changeMemberRole(
        workspaceId,
        memberId,
        input.roleCode,
        input.version,
        auth,
        identity,
      ),
    };
  }

  @Delete("workspaces/:workspaceId/members/:memberId")
  @HttpCode(204)
  async removeMember(
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ): Promise<void> {
    const { auth, identity } = await this.writeContext(request, csrf);
    await this.workspaceService.removeMember(
      workspaceId,
      memberId,
      auth,
      identity,
    );
  }

  private async writeContext(request: Request, csrf: string | undefined) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    const identity = this.identity(request);
    this.authService.assertCsrf(auth, csrf, identity.origin);
    return { auth, identity };
  }

  private identity(request: Request): RequestIdentity {
    const origin = request.header("origin") ?? "";
    if (!origin) throw this.validationError();
    return {
      deviceId: request.header("x-device-id") ?? "session-device-unavailable",
      ip: request.ip || request.socket.remoteAddress || "unknown",
      origin,
      userAgent: request.header("user-agent") ?? "unknown",
    };
  }

  private sessionToken(request: Request): string | undefined {
    return readSessionToken(request, "user");
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
      { error: { code: "VALIDATION_FAILED", message: "请求参数不符合要求。" } },
      HttpStatus.BAD_REQUEST,
    );
  }
}
