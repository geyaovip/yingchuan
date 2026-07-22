import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import {
  createNestLogger,
  createServiceLogger,
} from "@yingchuan/observability";

import { WorkerModule } from "./worker.module.js";

const workerLogger = createServiceLogger({
  environment: process.env.NODE_ENV ?? "development",
  service: "yingchuan-worker",
  version: "0.1.0",
});

async function bootstrap(): Promise<void> {
  const context = await NestFactory.createApplicationContext(WorkerModule, {
    logger: createNestLogger(workerLogger),
  });
  context.enableShutdownHooks();
}

void bootstrap();
