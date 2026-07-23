import { describe, expect, it } from "vitest";

import { capabilities, productUrl, workflow } from "./content";

describe("website content", () => {
  it("links the primary action to the production user application", () => {
    expect(productUrl).toBe("https://app.chatway.chat");
  });

  it("describes the complete first-use workflow", () => {
    expect(workflow.map(([title]) => title)).toEqual([
      "输入品牌",
      "确认问题",
      "启动分析",
      "查看报告",
    ]);
  });

  it("keeps the landing page capability set concise", () => {
    expect(capabilities).toHaveLength(4);
  });
});
