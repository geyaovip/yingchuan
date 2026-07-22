import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "./app.module.js";
import { configureApi } from "./configure-api.js";

describe("API observability", () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns request and trace correlation headers", async () => {
    const response = await request(server)
      .get("/api/v1/health")
      .set("x-request-id", "integration_request_123")
      .set(
        "traceparent",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      )
      .expect(200);

    expect(response.headers["x-request-id"]).toBe("integration_request_123");
    expect(response.headers["x-trace-id"]).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736",
    );
  });

  it("reports all local dependencies as ready", async () => {
    const response = await request(server).get("/api/v1/ready").expect(200);

    expect(response.body).toMatchObject({
      checks: {
        postgres: { status: "up" },
        private_files: { status: "up" },
        redis: { status: "up" },
      },
      status: "ready",
    });
  });

  it("exposes Prometheus metrics without high-cardinality route labels", async () => {
    const response = await request(server).get("/api/v1/metrics").expect(200);

    expect(response.text).toContain("yingchuan_http_requests_total");
    expect(response.text).not.toContain('path="');
    expect(response.text).not.toContain('email="');
  });

  it("allows only the two production credentialed CORS origins", async () => {
    const allowed = await request(server)
      .options("/api/v1/auth/session")
      .set("Access-Control-Request-Method", "GET")
      .set("Origin", "https://app.chatway.chat")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://app.chatway.chat",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const preview = await request(server)
      .options("/api/v1/auth/session")
      .set("Access-Control-Request-Method", "GET")
      .set("Origin", "https://preview.pages.dev")
      .expect(204);
    expect(preview.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
import type { Server } from "node:http";
