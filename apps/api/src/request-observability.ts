import {
  createRequestId,
  createTraceId,
  runWithRequestContext,
} from "@yingchuan/observability";
import type { NextFunction, Request, Response } from "express";

import { apiMetrics, serviceLogger } from "./observability.js";

export function requestObservability(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = createRequestId(request.header("x-request-id"));
  const traceId = createTraceId(request.header("traceparent"));
  const startedAt = process.hrtime.bigint();

  response.setHeader("x-request-id", requestId);
  response.setHeader("x-trace-id", traceId);
  apiMetrics.activeRequests.inc();

  runWithRequestContext({ requestId, traceId }, () => {
    response.once("finish", () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const statusCode = String(response.statusCode);
      apiMetrics.activeRequests.dec();
      apiMetrics.requestsTotal.inc({
        method: request.method,
        status_code: statusCode,
      });
      apiMetrics.durationSeconds.observe(
        { method: request.method, status_code: statusCode },
        durationSeconds,
      );
      serviceLogger.info(
        {
          durationMs: Math.round(durationSeconds * 1000),
          method: request.method,
          path: request.path,
          result: response.statusCode >= 500 ? "error" : "success",
          statusCode: response.statusCode,
        },
        "http_request_completed",
      );
    });
    next();
  });
}
