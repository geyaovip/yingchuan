import { describe, expect, it } from "vitest";

import { API_VERSION } from "./index";

describe("shared contract", () => {
  it("uses the v1 API contract", () => {
    expect(API_VERSION).toBe("v1");
  });
});
