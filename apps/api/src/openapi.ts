import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("映川 API")
    .setDescription("映川用户端、管理端与 Worker 的公开 HTTP 契约。")
    .setVersion("0.1.0")
    .addCookieAuth(
      "yc_session",
      {
        in: "cookie",
        type: "apiKey",
      },
      "yingchuan_session",
    )
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) => `${controller}_${method}`,
  });
}

export function configureOpenApi(app: INestApplication): void {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/openapi.json",
    swaggerOptions: { persistAuthorization: false },
  });
}
