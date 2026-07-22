import { describe, expect, it } from "vitest";

import {
  createRequestId,
  createTraceId,
  getRequestContext,
  runWithRequestContext,
} from "./context.js";

describe("request context", () => {
  it("accepts safe request IDs and rejects untrusted values", () => {
    expect(createRequestId("client_request_123")).toBe("client_request_123");
    expect(createRequestId("bad value\nforged")).toMatch(/^req_[a-f0-9]{32}$/);
  });

  it("continues a valid W3C trace ID", () => {
    expect(
      createTraceId("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
    ).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(createTraceId("invalid")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("keeps context across async work", async () => {
    await runWithRequestContext(
      { requestId: "request_123", traceId: "a".repeat(32) },
      async () => {
        await Promise.resolve();
        expect(getRequestContext()?.requestId).toBe("request_123");
      },
    );
  });

  it("does not expose a mutable context reference", () => {
    runWithRequestContext(
      { requestId: "request_immutable", traceId: "b".repeat(32) },
      () => {
        const snapshot = { ...getRequestContext(), injected: "value" };
        expect(snapshot.injected).toBe("value");
        expect(getRequestContext()).toEqual({
          requestId: "request_immutable",
          traceId: "b".repeat(32),
        });
      },
    );
  });
});
