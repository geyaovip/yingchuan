import {
  createApiMetrics,
  createServiceLogger,
} from "@yingchuan/observability";

export const SERVICE_NAME = "yingchuan-api";
export const SERVICE_VERSION = "0.1.0";
export const serviceEnvironment = process.env.NODE_ENV ?? "development";
export const serviceLogger = createServiceLogger({
  environment: serviceEnvironment,
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
});
export const apiMetrics = createApiMetrics(
  SERVICE_NAME,
  serviceEnvironment,
  SERVICE_VERSION,
);
