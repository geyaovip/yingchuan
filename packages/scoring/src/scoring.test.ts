import { describe, expect, it } from "vitest";

import { parseResponse } from "./parser.js";
import { calculateScoreV1 } from "./score-v1.js";

describe("parser-v1 golden cases", () => {
  it.each([
    ["1. 映川：值得推荐\n2. 星河：也可考虑", true, true, 1],
    ["没有提到目标品牌。", false, false, undefined],
    ["抱歉，无法回答这个问题。", false, false, undefined],
    ["映川提供相关服务。", true, false, undefined],
  ] as const)(
    "parses target mention and recommendation deterministically",
    (text, mentioned, recommended, rank) => {
      const parsed = parseResponse(text, ["映川"]);
      const target = parsed.mentions.find((item) => item.kind === "target");
      expect(Boolean(target)).toBe(mentioned);
      expect(target?.recommended ?? false).toBe(recommended);
      expect(target?.rank).toBe(rank);
    },
  );

  it("extracts target facts and sentiment evidence", () => {
    const parsed = parseResponse("映川提供可靠的品牌分析服务，值得推荐。", [
      "映川",
    ]);
    expect(parsed.sentimentLabel).toBe("positive");
    expect(parsed.factClaims).toHaveLength(1);
    expect(parsed.factClaims[0]?.subject).toBe("映川");
  });
});

describe("score-v1", () => {
  it("is deterministic, redistributes N/A weight and gates confidence", () => {
    const input = {
      eligibleModelIds: ["a", "b"],
      plannedPromptIds: ["p1", "p2"],
      plannedRunCount: 4,
      samples: [
        {
          competitors: [{ name: "c", rank: 2 }],
          modelId: "a",
          parseConfidence: 95,
          promptId: "p1",
          rank: 1,
          recommended: true,
          targetMentioned: true,
        },
        {
          competitors: [],
          modelId: "b",
          parseConfidence: 90,
          promptId: "p2",
          recommended: false,
          targetMentioned: false,
        },
      ],
    };
    const first = calculateScoreV1(input);
    expect(calculateScoreV1(input)).toEqual(first);
    expect(first.overallScore).toBeGreaterThan(0);
    expect(first.confidence).toBeLessThanOrEqual(49);
    expect(
      first.dimensions.find((item) => item.code === "factual_accuracy"),
    ).toMatchObject({ effectiveWeight: 0, missingReason: "NO_VERIFIED_FACTS" });
    expect(
      first.dimensions.reduce((sum, item) => sum + item.effectiveWeight, 0),
    ).toBeCloseTo(1);
  });
});
