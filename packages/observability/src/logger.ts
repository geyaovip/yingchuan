import pino, { type Logger } from "pino";

import { getRequestContext } from "./context.js";

export interface ServiceLoggerOptions {
  readonly environment: string;
  readonly service: string;
  readonly version: string;
}

export function createServiceLogger(options: ServiceLoggerOptions): Logger {
  return pino({
    base: options,
    level: process.env.LOG_LEVEL ?? "info",
    messageKey: "message",
    mixin: () => ({ ...getRequestContext() }),
    redact: {
      paths: [
        "authorization",
        "cookie",
        "password",
        "token",
        "apiKey",
        "*.authorization",
        "*.cookie",
        "*.password",
        "*.token",
        "*.apiKey",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function createNestLogger(logger: Logger) {
  const messageText = (message: unknown): string =>
    typeof message === "string"
      ? message
      : message instanceof Error
        ? message.message
        : String(message);

  return {
    debug(message: unknown, context?: string): void {
      logger.debug({ context }, messageText(message));
    },
    error(message: unknown, trace?: string, context?: string): void {
      logger.error({ context, trace }, messageText(message));
    },
    fatal(message: unknown, context?: string): void {
      logger.fatal({ context }, messageText(message));
    },
    log(message: unknown, context?: string): void {
      logger.info({ context }, messageText(message));
    },
    verbose(message: unknown, context?: string): void {
      logger.trace({ context }, messageText(message));
    },
    warn(message: unknown, context?: string): void {
      logger.warn({ context }, messageText(message));
    },
  };
}
