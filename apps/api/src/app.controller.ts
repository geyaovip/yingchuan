import { Controller, Get, Res } from "@nestjs/common";
import type {
  HealthResponse,
  ReadinessResponse,
} from "@yingchuan/shared-types";
import type { Response } from "express";

import { AppService } from "./app.service.js";
import { apiMetrics } from "./observability.js";
import { ReadinessService } from "./readiness.service.js";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly readinessService: ReadinessService,
  ) {}

  @Get("health")
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }

  @Get("ready")
  async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const readiness = await this.readinessService.getReadiness();
    if (readiness.status === "degraded") {
      response.status(503);
    }
    return readiness;
  }

  @Get("metrics")
  async getMetrics(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.type(apiMetrics.registry.contentType);
    return this.appService.getMetrics();
  }
}
