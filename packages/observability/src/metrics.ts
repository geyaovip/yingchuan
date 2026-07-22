import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

export interface ApiMetrics {
  readonly activeRequests: Gauge;
  readonly durationSeconds: Histogram;
  readonly registry: Registry;
  readonly requestsTotal: Counter;
}

export function createApiMetrics(
  service: string,
  environment: string,
  version: string,
): ApiMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ environment, service, version });
  collectDefaultMetrics({ prefix: "yingchuan_", register: registry });

  const activeRequests = new Gauge({
    name: "yingchuan_http_active_requests",
    help: "Number of active HTTP requests.",
    registers: [registry],
  });
  const requestsTotal = new Counter({
    name: "yingchuan_http_requests_total",
    help: "Total number of completed HTTP requests.",
    labelNames: ["method", "status_code"],
    registers: [registry],
  });
  const durationSeconds = new Histogram({
    name: "yingchuan_http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "status_code"],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.8, 1.5, 3, 5],
    registers: [registry],
  });

  return { activeRequests, durationSeconds, registry, requestsTotal };
}
