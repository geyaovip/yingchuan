import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Patch,
  Req,
} from "@nestjs/common";
import { CompetitorStatus } from "@yingchuan/database";
import type { ScoringApplicationService } from "@yingchuan/scoring";
import type { Request } from "express";
import { z, ZodError } from "zod";

import { SESSION_COOKIE_NAME } from "../auth/auth.constants.js";
import { AuthService } from "../auth/auth.service.js";
import { SCORING_SERVICE } from "./scoring.constants.js";

const competitorSchema = z.object({
  canonicalName: z.string().trim().min(1).max(200).optional(),
  excludedReason: z.string().trim().min(1).max(500).optional(),
  status: z.enum(CompetitorStatus),
  version: z.number().int().positive(),
});

@Controller("projects/:projectId")
export class ScoringController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SCORING_SERVICE)
    private readonly scoring: ScoringApplicationService,
  ) {}

  @Get("scores")
  async scores(@Param("projectId") projectId: string, @Req() request: Request) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() =>
        this.scoring.listScores(projectId, auth.user.id),
      ),
    };
  }

  @Get("competitors")
  async competitors(
    @Param("projectId") projectId: string,
    @Req() request: Request,
  ) {
    const auth = await this.auth(request);
    return {
      data: await this.perform(() =>
        this.scoring.listCompetitors(projectId, auth.user.id),
      ),
    };
  }

  @Patch("competitors/:competitorId")
  async update(
    @Param("projectId") projectId: string,
    @Param("competitorId") competitorId: string,
    @Body() body: unknown,
    @Headers("x-csrf-token") csrf: string | undefined,
    @Req() request: Request,
  ) {
    let input: z.infer<typeof competitorSchema>;
    try {
      input = competitorSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError)
        throw new HttpException(
          { error: { code: "VALIDATION_FAILED", message: "请检查竞品参数。" } },
          400,
        );
      throw error;
    }
    const auth = await this.auth(request);
    this.authService.assertCsrf(auth, csrf, request.header("origin") ?? "");
    return {
      data: await this.perform(() =>
        this.scoring.updateCompetitor(
          projectId,
          competitorId,
          input,
          auth.user.id,
        ),
      ),
    };
  }

  private async auth(request: Request) {
    const auth = await this.authService.getSession(this.sessionToken(request));
    this.authService.assertSessionOrigin(auth, request.header("origin"));
    return auth;
  }

  private sessionToken(request: Request): string | undefined {
    for (const item of request.header("cookie")?.split(";") ?? []) {
      const [name, ...value] = item.trim().split("=");
      if (name === SESSION_COOKIE_NAME)
        return decodeURIComponent(value.join("="));
    }
    return undefined;
  }

  private async perform<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const rawCode = error instanceof Error ? error.message : "SCORING_FAILED";
      const code = ["RESOURCE_NOT_FOUND", "CONCURRENT_MODIFICATION"].includes(
        rawCode,
      )
        ? rawCode
        : "SCORING_FAILED";
      throw new HttpException(
        { error: { code, message: "无法完成评分或竞品操作。" } },
        code === "RESOURCE_NOT_FOUND"
          ? 404
          : code === "CONCURRENT_MODIFICATION"
            ? 409
            : 500,
      );
    }
  }
}
