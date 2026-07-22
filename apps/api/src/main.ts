import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { createNestLogger } from "@yingchuan/observability";

import { AppModule } from "./app.module.js";
import { configureApi } from "./configure-api.js";
import { configureOpenApi } from "./openapi.js";
import { serviceLogger } from "./observability.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: createNestLogger(serviceLogger),
  });
  configureApi(app);
  configureOpenApi(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  serviceLogger.info({ port }, "api_started");
}

void bootstrap();
