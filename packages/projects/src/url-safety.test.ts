import { describe, expect, it } from "vitest";

import { isPrivateIp, normalizePublicUrl } from "./url-safety.js";

describe("URL safety", () => {
  it.each([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "https://10.1.2.3",
    "https://[::1]",
    "ftp://example.com/file",
    "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => normalizePublicUrl(url)).toThrow();
  });

  it("normalizes a public URL", () => {
    expect(normalizePublicUrl("HTTPS://Example.COM:443/about/#team")).toBe(
      "https://example.com/about",
    );
  });

  it.each(["10.0.0.1", "172.20.0.1", "192.168.1.1", "fc00::1", "fe80::1"])(
    "classifies private address %s",
    (address) => expect(isPrivateIp(address)).toBe(true),
  );
});
