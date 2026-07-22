import { describe, expect, it, vi } from "vitest";

import { SafeWebFetcher } from "./safe-fetcher.js";

const publicLookup = () => Promise.resolve([{ address: "93.184.216.34" }]);

describe("SafeWebFetcher", () => {
  it("fetches supported content and removes active HTML", async () => {
    const fetcher = new SafeWebFetcher(
      publicLookup,
      vi.fn(() =>
        Promise.resolve(
          new Response(
            "<main>Hello &amp; world<script>steal()</script></main>",
            {
              headers: { "content-type": "text/html; charset=utf-8" },
              status: 200,
            },
          ),
        ),
      ),
    );
    const result = await fetcher.fetch("https://example.com/");
    expect(result.extractedText).toBe("Hello & world");
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("revalidates every redirect and blocks a private destination", async () => {
    const fetcher = new SafeWebFetcher(
      (hostname) =>
        Promise.resolve([
          {
            address:
              hostname === "private.example" ? "10.0.0.8" : "93.184.216.34",
          },
        ]),
      vi.fn(() =>
        Promise.resolve(
          new Response(null, {
            headers: { location: "http://private.example/internal" },
            status: 302,
          }),
        ),
      ),
    );
    await expect(fetcher.fetch("https://example.com/")).rejects.toMatchObject({
      code: "FETCH_DESTINATION_BLOCKED",
    });
  });

  it("enforces the decompressed response size", async () => {
    const fetcher = new SafeWebFetcher(
      publicLookup,
      vi.fn(() =>
        Promise.resolve(
          new Response("content larger than limit", {
            headers: { "content-type": "text/plain" },
            status: 200,
          }),
        ),
      ),
    );
    await expect(
      fetcher.fetch("https://example.com/", { maxBytes: 5 }),
    ).rejects.toMatchObject({ code: "FETCH_SIZE_LIMIT" });
  });
});
