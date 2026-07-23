import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenClawHttpRuntime } from "./openclaw-runtime.js";

describe("OpenClaw HTTP runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the official chat completions endpoint with an evidence-only prompt", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "基于证据的回答" } }],
          usage: { completion_tokens: 6, prompt_tokens: 18 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await new OpenClawHttpRuntime(
      "http://openclaw:18789/",
      "gateway-token",
    ).formulate(
      "平台如何？",
      [
        {
          citation: "skill://dashboard/1",
          data: { users: 2 },
          skill: "dashboard.read",
        },
      ],
      5_000,
      800,
    );

    expect(result).toEqual({
      answer: "基于证据的回答",
      inputTokens: 18,
      outputTokens: 6,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://openclaw:18789/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    const request = JSON.parse(
      fetcher.mock.calls[0]![1].body as string,
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      max_completion_tokens: 800,
      model: "openclaw/default",
      stream: false,
    });
    expect(JSON.stringify(request)).toContain("skill://dashboard/1");
  });

  it("normalizes network failures to an actionable runtime error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    await expect(
      new OpenClawHttpRuntime("http://openclaw:18789").formulate(
        "平台如何？",
        [],
        5_000,
        800,
      ),
    ).rejects.toThrow("OPENCLAW_UNAVAILABLE");
  });
});
