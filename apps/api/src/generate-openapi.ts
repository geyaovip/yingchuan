import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApi } from "./configure-api.js";
import { createOpenApiDocument } from "./openapi.js";

const app = await NestFactory.create(AppModule, {
  abortOnError: false,
  logger: ["error"],
});
configureApi(app);
await app.init();
const document = createOpenApiDocument(app);
const outputDirectory = resolve(import.meta.dirname, "../../../docs/generated");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "openapi.json"),
  `${JSON.stringify(document, undefined, 2)}\n`,
  "utf8",
);
await app.close();
