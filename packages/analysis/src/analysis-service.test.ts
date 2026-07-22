import type { PrismaClient } from "@yingchuan/database";
import type { ModelGatewayApplicationService } from "@yingchuan/model-gateway";
import { describe, expect, it } from "vitest";

import { AnalysisApplicationService } from "./analysis-service.js";
import type { AnalysisServiceError } from "./analysis-service.js";

describe("AnalysisApplicationService", () => {
  it("rejects a missing idempotency key before any database or model work", async () => {
    const service = new AnalysisApplicationService(
      {} as PrismaClient,
      {} as ModelGatewayApplicationService,
    );

    await expect(
      service.create(
        "00000000-0000-0000-0000-000000000000",
        {
          email: "fixture-user@example.com",
          userId: "00000000-0000-0000-0000-000000000001",
        },
        "",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AnalysisServiceError>>({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        status: 400,
      }),
    );
  });
});
