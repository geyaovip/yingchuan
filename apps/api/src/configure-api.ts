import type { INestApplication } from "@nestjs/common";

import { requestObservability } from "./request-observability.js";

export function configureApi(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: number): void;
  };
  express.set("trust proxy", 1);
  const origins = ["https://app.chatway.chat", "https://admin.chatway.chat"];
  if (process.env.NODE_ENV === "development") {
    origins.push(
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    );
  }
  app.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: origins,
  });
  app.setGlobalPrefix("api/v1");
  app.use(requestObservability);
  app.enableShutdownHooks();
}
