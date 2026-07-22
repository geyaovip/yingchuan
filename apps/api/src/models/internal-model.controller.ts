import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Post,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import {
  ModelGatewayApplicationService,
  ModelGatewayServiceError,
} from "@yingchuan/model-gateway";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { MODEL_GATEWAY_SERVICE } from "./model.constants.js";

const requestSchema = z.object({
  max_completion_tokens: z.number().int().min(1).max(10_000).optional(),
  max_tokens: z.number().int().min(1).max(10_000).optional(),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.union([z.string(), z.array(z.unknown())]),
    }),
  ),
  model: z.string(),
});

@Controller("internal/model-gateway/v1")
@ApiExcludeController()
export class InternalModelController {
  constructor(
    @Inject(MODEL_GATEWAY_SERVICE)
    private readonly models: ModelGatewayApplicationService,
  ) {}

  @Get("models")
  modelsList(@Headers("authorization") authorization?: string) {
    this.authorize(authorization);
    return {
      data: [{ id: "yingchuan-agent", object: "model", owned_by: "yingchuan" }],
      object: "list",
    };
  }

  @Post("chat/completions")
  async complete(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    this.authorize(authorization);
    const input = requestSchema.parse(body);
    const prompt = input.messages
      .map(
        (message) =>
          `${message.role}: ${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`,
      )
      .join("\n");
    try {
      const result = await this.models.invokeDefaultAgentModel({
        maxOutputTokens: input.max_completion_tokens ?? input.max_tokens,
        prompt,
        requestId: `openclaw_${randomUUID()}`,
      });
      return {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: result.text, role: "assistant" },
          },
        ],
        id: result.providerRequestId ?? `chatcmpl_${randomUUID()}`,
        model: input.model,
        object: "chat.completion",
        usage: {
          completion_tokens: result.outputTokens,
          prompt_tokens: result.inputTokens,
          total_tokens: result.inputTokens + result.outputTokens,
        },
      };
    } catch (error) {
      if (error instanceof ModelGatewayServiceError)
        throw new HttpException(
          { error: { code: error.code, message: "模型网关暂时不可用。" } },
          error.status,
        );
      throw error;
    }
  }

  private authorize(header?: string) {
    const expected = getRuntimeValue("OPENCLAW_GATEWAY_TOKEN", {
      fallback: "local-openclaw-token-change-me",
    });
    const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const left = createHash("sha256").update(expected).digest();
    const right = createHash("sha256").update(supplied).digest();
    if (!supplied || !timingSafeEqual(left, right))
      throw new HttpException(
        { error: { code: "UNAUTHORIZED", message: "无权访问内部模型网关。" } },
        401,
      );
  }
}
