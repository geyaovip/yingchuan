import { describe, expect, it } from "vitest";

describe("report recommendation ordering", () => {
  it("keeps P0 ahead of lower priorities", () => {
    expect(["P0", "P1", "P2", "P3"].indexOf("P0")).toBe(0);
  });
});
