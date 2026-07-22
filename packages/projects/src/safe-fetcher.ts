import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";

import {
  isForbiddenHostname,
  isPrivateIp,
  normalizePublicUrl,
} from "./url-safety.js";

export interface SafeFetchResult {
  readonly contentHash: string;
  readonly extractedText: string;
  readonly finalUrl: string;
  readonly httpStatus: number;
  readonly mimeType: string;
}

export interface SafeFetchOptions {
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
}

type Lookup = (hostname: string) => Promise<readonly { address: string }[]>;
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export class SafeFetchError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SafeFetchError";
  }
}

export class SafeWebFetcher {
  constructor(
    private readonly lookup: Lookup = async (hostname) =>
      dnsLookup(hostname, { all: true, verbatim: true }),
    private readonly fetchImplementation: Fetch = (input, init) =>
      globalThis.fetch(input, init),
  ) {}

  async fetch(
    input: string,
    options: SafeFetchOptions = {},
  ): Promise<SafeFetchResult> {
    const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    const maxRedirects = options.maxRedirects ?? 5;
    const timeoutMs = options.timeoutMs ?? 10_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let current = normalizePublicUrl(input);
    try {
      for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
        await this.assertPublicDestination(current);
        const response = await this.fetchImplementation(current, {
          headers: {
            accept:
              "text/html,application/json,text/plain,application/xml,text/xml;q=0.9",
            "user-agent": "YingchuanSourceFetcher/0.1",
          },
          redirect: "manual",
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new SafeFetchError("FETCH_REDIRECT_INVALID");
          if (redirect === maxRedirects)
            throw new SafeFetchError("FETCH_REDIRECT_LIMIT");
          current = normalizePublicUrl(new URL(location, current).toString());
          continue;
        }
        if (!response.ok) throw new SafeFetchError("FETCH_HTTP_STATUS");
        const mimeType = (response.headers.get("content-type") ?? "")
          .split(";", 1)[0]!
          .trim()
          .toLowerCase();
        if (!this.isSupportedMime(mimeType))
          throw new SafeFetchError("FETCH_MIME_UNSUPPORTED");
        const declaredLength = Number(
          response.headers.get("content-length") ?? 0,
        );
        if (declaredLength > maxBytes)
          throw new SafeFetchError("FETCH_SIZE_LIMIT");
        const bytes = await this.readLimited(response, maxBytes);
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        return {
          contentHash: createHash("sha256").update(bytes).digest("hex"),
          extractedText: this.extractText(text, mimeType),
          finalUrl: current,
          httpStatus: response.status,
          mimeType,
        };
      }
      throw new SafeFetchError("FETCH_REDIRECT_LIMIT");
    } catch (error) {
      if (error instanceof SafeFetchError) throw error;
      if (controller.signal.aborted) throw new SafeFetchError("FETCH_TIMEOUT");
      throw new SafeFetchError("FETCH_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async assertPublicDestination(input: string): Promise<void> {
    const hostname = new URL(input).hostname.replace(/^\[|\]$/g, "");
    if (isForbiddenHostname(hostname))
      throw new SafeFetchError("FETCH_DESTINATION_BLOCKED");
    const addresses = await this.lookup(hostname);
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isPrivateIp(address))
    )
      throw new SafeFetchError("FETCH_DESTINATION_BLOCKED");
  }

  private async readLimited(
    response: Response,
    maxBytes: number,
  ): Promise<Uint8Array> {
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new SafeFetchError("FETCH_SIZE_LIMIT");
      }
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  private isSupportedMime(value: string): boolean {
    return (
      value === "text/html" ||
      value === "text/plain" ||
      value === "application/json" ||
      value === "application/xml" ||
      value === "text/xml"
    );
  }

  private extractText(value: string, mimeType: string): string {
    if (mimeType !== "text/html") return value.trim();
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
}
