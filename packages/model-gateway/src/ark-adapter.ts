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
      ...(request.apiMode === "chat_completions" &&
      request.modelCode === "doubao-seed-2-1-turbo-260628" &&
      !request.nativeWebSearch
        ? { thinking: { type: "disabled" } }
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
    if (
      response.status === 404 &&
      (text.includes("invalidendpointormodel.notfound") ||
        text.includes("model or endpoint"))
    )
      return new ModelGatewayError(
        "provider_unavailable",
        "PROVIDER_MODEL_UNAVAILABLE",
        false,
      );
    if (response.status === 404 && text.includes("toolnotopen"))
      return new ModelGatewayError(
        "provider_unavailable",
        "PROVIDER_CAPABILITY_UNAVAILABLE",
        false,
      );
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
    const citations = this.citations(value, output);
    const finishReason =
      typeof first.finish_reason === "string"
        ? first.finish_reason.slice(0, 32)
        : value.status === "incomplete"
          ? "length"
          : undefined;
    return {
      citations,
      finishReason,
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

  private citations(
    value: Record<string, unknown>,
    output: readonly unknown[],
  ): ModelGatewayCitation[] {
    const candidates: unknown[] = [];
    if (Array.isArray(value.citations))
      for (const citation of value.citations as unknown[])
        candidates.push(citation);
    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const entry of content) {
        const annotations = (entry as { annotations?: unknown }).annotations;
        if (Array.isArray(annotations))
          for (const annotation of annotations as unknown[])
            candidates.push(annotation);
      }
    }

    const byUrl = new Map<string, ModelGatewayCitation>();
    for (const item of candidates) {
      const candidate = item as {
        title?: unknown;
        url?: unknown;
        url_citation?: { title?: unknown; url?: unknown };
      };
      const nested = candidate.url_citation;
      const url = nested?.url ?? candidate.url;
      const title = nested?.title ?? candidate.title;
      if (typeof url !== "string" || url.length === 0) continue;
      const existing = byUrl.get(url);
      byUrl.set(url, {
        url,
        ...(typeof title === "string" && title.length > 0
          ? { title }
          : existing?.title
            ? { title: existing.title }
            : {}),
      });
    }
    return [...byUrl.values()];
  }
}
