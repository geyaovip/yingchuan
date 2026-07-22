import { Injectable } from "@nestjs/common";
import type { HealthResponse } from "@yingchuan/shared-types";

import { apiMetrics, SERVICE_NAME, SERVICE_VERSION } from "./observability.js";

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return {
      service: SERVICE_NAME,
      status: "ok",
      version: SERVICE_VERSION,
    };
  }

  getMetrics(): Promise<string> {
    return apiMetrics.registry.metrics();
  }
}
