import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "./app.module.js";
import { configureApi } from "./configure-api.js";
import { createOpenApiDocument } from "./openapi.js";

describe("OpenAPI contract", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.init();
  });

  afterAll(async () => app.close());

  it("generates the implemented v1 routes and session security scheme", () => {
    const document = createOpenApiDocument(app);
    expect(Object.keys(document.paths).length).toBeGreaterThanOrEqual(24);
    expect(document.paths).toHaveProperty("/api/v1/auth/session");
    expect(document.paths).toHaveProperty("/api/v1/workspaces/{workspaceId}");
    expect(document.paths).toHaveProperty("/api/v1/admin/audit-logs");
    expect(document.paths).toHaveProperty("/api/v1/projects");
    expect(document.paths).toHaveProperty(
      "/api/v1/projects/{projectId}/identification-confirmations",
    );
    expect(document.components?.securitySchemes).toHaveProperty(
      "yingchuan_session",
    );
  });
});
