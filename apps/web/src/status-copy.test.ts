import { StatePanel } from "@yingchuan/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("status copy", () => {
  it("keeps the state and action usable without an explanation", () => {
    const html = renderToStaticMarkup(
      createElement(StatePanel, {
        action: createElement("button", null, "刷新"),
        title: "当前没有告警",
      }),
    );

    expect(html).toContain("<h2>当前没有告警</h2>");
    expect(html).toContain("<button>刷新</button>");
    expect(html).not.toContain("<p>");
  });

  it("retains the cause and recovery action for a failure", () => {
    const html = renderToStaticMarkup(
      createElement(StatePanel, {
        action: createElement("button", null, "重新连接"),
        description: "网络连接失败，请检查后重试。",
        title: "暂时无法连接映川",
        tone: "error",
      }),
    );

    expect(html).toContain("网络连接失败，请检查后重试。");
    expect(html).toContain("<button>重新连接</button>");
  });
});
