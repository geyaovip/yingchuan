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
  Query,
  Req,
} from "@nestjs/common";
import {
  ProjectApplicationService,
  ProjectServiceError,
} from "@yingchuan/projects";
import type { Request } from "express";
import { ZodError } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { sessionToken as readSessionToken } from "../auth/session-cookie.js";
import type {
  AuthenticatedSession,
  RequestIdentity,
} from "../auth/auth.types.js";
import { PROJECT_SERVICE } from "./project.constants.js";
import {
  confirmIdentificationSchema,
  createCandidateSchema,
  createProjectSchema,
  createSourceSchema,
  updateProjectSchema,
  updateSourceSchema,
} from "./project.schemas.js";

@Controller("projects")
export class ProjectController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PROJECT_SERVICE)
    private readonly projects: ProjectApplicationService,
  ) {}

  @Post()
  async create(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw this.error("VALIDATION_FAILED", 400);
    const input = this.parse(() => createProjectSchema.parse(body));
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.create(input, this.actor(auth), idempotencyKey),
      ),
    };
  }

  @Get()
  async list(
    @Query("workspaceId") workspaceId: string | undefined,
    @Req() request: Request,
  ) {
    if (!workspaceId) throw this.error("VALIDATION_FAILED", 400);
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.perform(() =>
        this.projects.list(workspaceId, auth.user.id),
      ),
    };
  }

  @Get(":projectId")
  async get(@Param("projectId") projectId: string, @Req() request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.perform(() =>
        this.projects.get(projectId, auth.user.id),
      ),
    };
  }

  @Patch(":projectId")
  async update(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => updateProjectSchema.parse(body));
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.update(projectId, input, this.actor(auth)),
      ),
    };
  }

  @Post(":projectId/archive-actions")
  async archive(
    @Param("projectId") projectId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.archive(projectId, this.actor(auth)),
      ),
    };
  }

  @Post(":projectId/restore-actions")
  async restore(
    @Param("projectId") projectId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.restore(projectId, this.actor(auth)),
      ),
    };
  }

  @Get(":projectId/identification-jobs/:jobId")
  async identificationJob(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.perform(() =>
        this.projects.getIdentificationJob(projectId, jobId, auth.user.id),
      ),
    };
  }

  @Post(":projectId/brand-candidates")
  async addCandidate(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => createCandidateSchema.parse(body));
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.addCandidate(projectId, input, this.actor(auth)),
      ),
    };
  }

  @Delete(":projectId/brand-candidates/:candidateId")
  async rejectCandidate(
    @Param("projectId") projectId: string,
    @Param("candidateId") candidateId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.rejectCandidate(projectId, candidateId, this.actor(auth)),
      ),
    };
  }

  @Post(":projectId/identification-confirmations")
  async confirm(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => confirmIdentificationSchema.parse(body));
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.confirm(projectId, input, this.actor(auth)),
      ),
    };
  }

  @Post(":projectId/sources")
  async createSource(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => createSourceSchema.parse(body));
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.createSource(projectId, input, this.actor(auth)),
      ),
    };
  }

  @Patch(":projectId/sources/:sourceId")
  async updateSource(
    @Param("projectId") projectId: string,
    @Param("sourceId") sourceId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const input = this.parse(() => updateSourceSchema.parse(body));
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.updateSource(
          projectId,
          sourceId,
          input,
          this.actor(auth),
        ),
      ),
    };
  }

  @Delete(":projectId/sources/:sourceId")
  async disableSource(
    @Param("projectId") projectId: string,
    @Param("sourceId") sourceId: string,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.disableSource(projectId, sourceId, this.actor(auth)),
      ),
    };
  }

  @Post(":projectId/sources/:sourceId/fetch-actions")
  async fetchSource(
    @Param("projectId") projectId: string,
    @Param("sourceId") sourceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw this.error("VALIDATION_FAILED", 400);
    const { auth } = await this.writeContext(request, csrf);
    return {
      data: await this.perform(() =>
        this.projects.queueSourceFetch(
          projectId,
          sourceId,
          idempotencyKey,
          this.actor(auth),
        ),
      ),
    };
  }

  @Get(":projectId/sources/:sourceId/snapshots")
  async sourceSnapshots(
    @Param("projectId") projectId: string,
    @Param("sourceId") sourceId: string,
    @Req() request: Request,
  ) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    return {
      data: await this.perform(() =>
        this.projects.listSourceSnapshots(projectId, sourceId, auth.user.id),
      ),
    };
  }

  private async writeContext(request: Request, csrf: string | undefined) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    const identity = this.identity(request);
    this.authService.assertCsrf(auth, csrf, identity.origin);
    return { auth, identity };
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
      if (error instanceof ProjectServiceError)
        throw this.error(error.code, error.status);
      throw error;
    }
  }

  private error(code: string, status: 400 | 403 | 404 | 409) {
    const messages = {
      CONCURRENT_MODIFICATION: "数据已被其他操作更新，请刷新后重试。",
      FORBIDDEN: "没有执行此操作的权限。",
      IDEMPOTENCY_CONFLICT: "相同幂等键对应了不同请求。",
      PROJECT_ARCHIVED: "项目已归档，当前操作不可用。",
      PROJECT_NOT_RESTORABLE: "项目当前不可恢复。",
      PROJECT_STATE_CONFLICT: "项目当前状态不允许此操作。",
      RESOURCE_NOT_FOUND: "请求的资源不存在。",
      SOURCE_ALREADY_EXISTS: "该认知源已存在。",
      SOURCE_NOT_CONFIRMED: "只有已确认的认知源可以抓取。",
      VALIDATION_FAILED: "请求参数不符合要求。",
    } as const;
    return new HttpException(
      {
        error: {
          code,
          message: messages[code as keyof typeof messages] ?? "请求未能完成。",
        },
      },
      status,
    );
  }
}
