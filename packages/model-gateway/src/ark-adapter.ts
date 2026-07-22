import {
  ModelGatewayError,
  type ModelGatewayCitation,
  type ModelGatewayRequest,
  type ModelGatewayResponse,
  type ModelProviderAdapter,
} from "./contracts.js";

type FetchLike = typeof fetch;

export class VolcengineArkAdapter implements ModelProviderAdapter {
  constructor(
    private readonly fetcher: FetchLike = fetch,
    private readonly baseUrl = "https://ark.cn-beijing.volces.com/api/v3",
  ) {}

  async invoke(
    request: ModelGatewayRequest,
    credential: string,
  ): Promise<ModelGatewayResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const path =
      request.apiMode === "responses" ? "responses" : "chat/completions";
    try {
      const response = await this.fetcher(`${this.baseUrl}/${path}`, {
        body: JSON.stringify(this.body(request)),
        headers: {
          authorization: `Bearer ${credential}`,
          "content-type": "application/json",
          "x-request-id": request.requestId,
        },
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) throw await this.httpError(response);
      const value = (await response.json()) as Record<string, unknown>;
      return this.parse(
        value,
        response.headers.get("x-request-id") ?? undefined,
      );
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new ModelGatewayError("timeout", "PROVIDER_TIMEOUT", true);
      throw new ModelGatewayError(
        "provider_unavailable",
        "PROVIDER_UNAVAILABLE",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private body(request: ModelGatewayRequest): Record<string, unknown> {
    const input =
      request.apiMode === "responses"
        ? { input: request.prompt }
        : { messages: [{ content: request.prompt, role: "user" }] };
    return {
      model: request.modelCode,
      ...input,
      ...(request.maxOutputTokens
        ? request.apiMode === "responses"
          ? { max_output_tokens: request.maxOutputTokens }
          : { max_tokens: request.maxOutputTokens }
        : {}),
      ...(request.nativeWebSearch
        ? { tools: [request.nativeWebSearch.toolConfig] }
        : {}),
    };
  }

  private async httpError(response: Response): Promise<ModelGatewayError> {
    const text = (await response.text()).slice(0, 1000).toLowerCase();
    if (response.status === 401 || response.status === 403)
      return new ModelGatewayError(
        "authentication",
        "PROVIDER_AUTHENTICATION_FAILED",
        false,
      );
    if (response.status === 429)
      return new ModelGatewayError("rate_limit", "PROVIDER_RATE_LIMITED", true);
    if (response.status >= 500)
      return new ModelGatewayError(
        "provider_unavailable",
        "PROVIDER_UNAVAILABLE",
        true,
      );
    if (text.includes("policy") || text.includes("safety"))
      return new ModelGatewayError(
        "policy_rejection",
        "PROVIDER_POLICY_REJECTED",
        false,
      );
    return new ModelGatewayError("unknown", "PROVIDER_REQUEST_FAILED", false);
  }

  private parse(
    value: Record<string, unknown>,
    headerRequestId?: string,
  ): ModelGatewayResponse {
    const usage = (value.usage ?? {}) as Record<string, unknown>;
    const choices = Array.isArray(value.choices) ? value.choices : [];
    const first = (choices[0] ?? {}) as Record<string, unknown>;
    const message = (first.message ?? {}) as Record<string, unknown>;
    const output: unknown[] = Array.isArray(value.output) ? value.output : [];
    let responseText: string | undefined;
    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      const candidate = content
        .map((entry: unknown) => (entry as { text?: unknown }).text)
        .find((text: unknown): text is string => typeof text === "string");
      if (candidate) {
        responseText = candidate;
        break;
      }
    }
    const text =
      typeof message.content === "string" ? message.content : responseText;
    if (!text)
      throw new ModelGatewayError(
        "invalid_response",
        "PROVIDER_RESPONSE_INVALID",
        false,
      );
    const citationsValue = Array.isArray(value.citations)
      ? value.citations
      : [];
    const citations: ModelGatewayCitation[] = citationsValue.flatMap((item) => {
      const citation = item as { title?: unknown; url?: unknown };
      return typeof citation.url === "string"
        ? [
            {
              url: citation.url,
              ...(typeof citation.title === "string"
                ? { title: citation.title }
                : {}),
            },
          ]
        : [];
    });
    return {
      citations,
      inputTokens: this.number(usage.input_tokens ?? usage.prompt_tokens),
      outputTokens: this.number(usage.output_tokens ?? usage.completion_tokens),
      providerRequestId:
        typeof value.id === "string" ? value.id : headerRequestId,
      text,
    };
  }

  private number(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0;
  }
}
