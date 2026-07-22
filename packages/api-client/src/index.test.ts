import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "./index.js";

describe("ApiClient", () => {
  it("does not duplicate the API prefix when a configured URL includes it", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { status: "ok" } }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://api.chatway.chat/api/v1/",
      fetch,
    });

    await client.request("/health");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.chatway.chat/api/v1/health",
      expect.any(Object),
    );
  });

  it("sends credential, csrf, device and request headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://api.chatway.chat/",
      fetch: fetcher,
      getDeviceId: () => "device_test_1234",
    });
    client.setSession({
      audience: "user",
      csrfToken: "csrf-test",
      email: "user@example.com",
      expiresAt: new Date().toISOString(),
      userId: "user-1",
    });
    client.selectWorkspace("workspace-1");

    await client.request("/things", { body: "{}", method: "POST" });

    const request = fetcher.mock.calls[0]!;
    const init = request[1]!;
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe("include");
    expect(headers.get("x-csrf-token")).toBe("csrf-test");
    expect(headers.get("x-device-id")).toBe("device_test_1234");
    expect(headers.get("x-request-id")).toBeTruthy();
    expect(headers.get("x-workspace-id")).toBe("workspace-1");
  });

  it("isolates cached and in-flight data after a workspace switch", async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => (finish = resolve));
    const client = new ApiClient({
      baseUrl: "https://api.chatway.chat",
      fetch: vi.fn<typeof fetch>().mockReturnValue(pending),
      getDeviceId: () => "device_test_1234",
    });
    client.selectWorkspace("workspace-a");
    const request = client.request("/projects", {}, { cache: true });
    client.selectWorkspace("workspace-b");
    finish(
      new Response(JSON.stringify({ data: ["old"] }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(request).rejects.toMatchObject({
      detail: { code: "WORKSPACE_CONTEXT_CHANGED" },
    });
  });
});
