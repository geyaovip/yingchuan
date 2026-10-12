import { describe, expect, it } from "vitest";

import { formatScore } from "./score-format";

describe("formatScore", () => {
  it("renders Prisma Decimal JSON strings without crashing report pages", () => {
    expect(formatScore("25.00")).toBe("25.0");
    expect(formatScore(49)).toBe("49.0");
    expect(formatScore(null)).toBe("—");
  });
});
