export const API_VERSION = "v1" as const;

export interface HealthResponse {
  readonly service: string;
  readonly status: "ok";
  readonly version: string;
}

export interface DependencyHealth {
  readonly latencyMs: number;
  readonly status: "up" | "down";
}

export interface ReadinessResponse {
  readonly checks: Readonly<Record<string, DependencyHealth>>;
  readonly service: string;
  readonly status: "ready" | "degraded";
  readonly version: string;
}

export type AppSurface = "web" | "admin";
