import { describe, expect, it, vi } from "vitest";

import { VolcengineArkAdapter } from "./ark-adapter.js";
import { ModelGatewayError } from "./contracts.js";
import { SecretBox } from "./secret-box.js";

const request = {
  apiMode: "chat_completions" as const,
  modelCode: "endpoint-test",
  prompt: "请介绍这个品牌。",
  requestId: "request-1",
  timeoutMs: 1_000,
};

describe("SecretBox", () => {
  it("encrypts with authenticated encryption and only exposes a mask", () => {
    const box = new SecretBox(
      "test_master_key_that_is_longer_than_32_characters",
    );
    const encrypted = box.encrypt("ark-secret-1234567890");
    expect(encrypted.ciphertext).not.toContain("ark-secret");
    expect(encrypted.maskedHint).toBe("ark***7890");
    expect(box.decrypt(encrypted)).toBe("ark-secret-1234567890");
  });
});

describe("VolcengineArkAdapter", () => {
  it("maps a chat completion and preserves provider request IDs", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            { finish_reason: "length", message: { content: "这是模型回答" } },
          ],
          id: "ark-request-1",
          usage: { completion_tokens: 9, prompt_tokens: 7 },
        }),
        { status: 200 },
      ),
    );
    const result = await new VolcengineArkAdapter(fetcher).invoke(
      request,
      "credential-value",
    );
    expect(result).toMatchObject({
      finishReason: "length",
      inputTokens: 7,
      outputTokens: 9,
      providerRequestId: "ark-request-1",
      text: "这是模型回答",
    });
    const options = fetcher.mock.calls[0]?.[1];
    expect(options?.headers).toMatchObject({
      authorization: "Bearer credential-value",
    });
  });

  it.each([
    [401, "authentication", "PROVIDER_AUTHENTICATION_FAILED", false],
    [429, "rate_limit", "PROVIDER_RATE_LIMITED", true],
    [503, "provider_unavailable", "PROVIDER_UNAVAILABLE", true],
  ] as const)(
    "maps HTTP %s without leaking response contents",
    async (status, category, code, retryable) => {
      const adapter = new VolcengineArkAdapter(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response("sensitive provider error", { status }),
          ),
      );
      const caught = await adapter
        .invoke(request, "credential-value")
        .catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(ModelGatewayError);
      expect(caught).toMatchObject({ category, code, retryable });
      expect(String(caught)).not.toContain("sensitive provider error");
    },
  );

  it.each([
    ["InvalidEndpointOrModel.NotFound", "PROVIDER_MODEL_UNAVAILABLE"],
    ["ToolNotOpen", "PROVIDER_CAPABILITY_UNAVAILABLE"],
  ] as const)(
    "maps Ark 404 %s to a non-retryable actionable code",
    async (providerCode, expectedCode) => {
      const adapter = new VolcengineArkAdapter(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(JSON.stringify({ error: { code: providerCode } }), {
            status: 404,
          }),
        ),
      );
      const caught = await adapter
        .invoke(request, "credential-value")
        .catch((error: unknown) => error);
      expect(caught).toMatchObject({
        category: "provider_unavailable",
        code: expectedCode,
        retryable: false,
      });
    },
  );

  it("passes native web configuration only when explicitly enabled", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "联网结果" } }] }),
          { status: 200 },
        ),
      );
    await new VolcengineArkAdapter(fetcher).invoke(
      {
        ...request,
        nativeWebSearch: {
          enabled: true,
          toolConfig: { type: "web_search" },
          toolVersion: "ark-web-v1",
        },
      },
      "credential-value",
    );
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    expect(typeof rawBody).toBe("string");
    const body = JSON.parse(rawBody as string) as {
      tools: unknown[];
    };
    expect(body.tools).toEqual([{ type: "web_search" }]);
  });

  it("uses the documented fast non-thinking mode for Doubao 2.1 Turbo chat answers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ choices: [{ message: { content: "回答" } }] }),
            { status: 200 },
          ),
        ),
      );
    const adapter = new VolcengineArkAdapter(fetcher);
    await adapter.invoke(
      { ...request, modelCode: "doubao-seed-2-1-turbo-260628" },
      "credential-value",
    );
    await adapter.invoke(
      {
        ...request,
        modelCode: "doubao-seed-2-1-turbo-260628",
        nativeWebSearch: {
          enabled: true,
          toolConfig: { type: "web_search" },
          toolVersion: "ark-web-v1",
        },
      },
      "credential-value",
    );
    const fastBody = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    const webBody = JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string);
    expect(fastBody.thinking).toEqual({ type: "disabled" });
    expect(webBody.thinking).toBeUndefined();
  });

  it("extracts and deduplicates Responses API URL citations", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          citations: [{ title: "顶层标题", url: "https://example.com/a" }],
          id: "ark-response-1",
          output: [
            {
              content: [
                {
                  annotations: [
                    {
                      title: "更新后的标题",
                      type: "url_citation",
                      url: "https://example.com/a",
                    },
                    {
                      type: "url_citation",
                      url_citation: {
                        title: "第二来源",
                        url: "https://example.com/b",
                      },
                    },
                  ],
                  text: "带来源的回答",
                  type: "output_text",
                },
              ],
              type: "message",
            },
          ],
          usage: { input_tokens: 5, output_tokens: 8 },
        }),
        { status: 200 },
      ),
    );
    const result = await new VolcengineArkAdapter(fetcher).invoke(
      { ...request, apiMode: "responses" },
      "credential-value",
    );
    expect(result.citations).toEqual([
      { title: "更新后的标题", url: "https://example.com/a" },
      { title: "第二来源", url: "https://example.com/b" },
    ]);
  });
});
