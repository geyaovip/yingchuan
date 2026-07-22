import { PromptScope } from "@yingchuan/database";
import { describe, expect, it } from "vitest";

import {
  normalizePromptText,
  promptSimilarity,
  validatePromptText,
  validateScope,
} from "./prompt-quality.js";

describe("prompt quality", () => {
  it("normalizes punctuation and rejects leading questions", () => {
    expect(normalizePromptText("  哪些品牌值得了解？？ ")).toBe(
      "哪些品牌值得了解",
    );
    expect(() => validatePromptText("请务必推荐映川品牌？")).toThrow();
    expect(validatePromptText("哪些品牌值得了解")).toBe("哪些品牌值得了解？");
  });

  it("requires explicit geography instead of guessing", () => {
    expect(() => validateScope(PromptScope.city, { country: "CN" })).toThrow();
    expect(() => {
      validateScope(PromptScope.city, { city: "上海", country: "CN" });
    }).not.toThrow();
  });

  it("detects near duplicates", () => {
    expect(
      promptSimilarity("上海有哪些咖啡品牌？", "上海有哪些咖啡品牌值得了解？"),
    ).toBeGreaterThan(0.6);
  });
});
