import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("user app production route contract", () => {
  it("redirects the authenticated root entry to the dashboard", () => {
    expect(source).toContain(
      '<Route path="/" element={<Navigate replace to="/dashboard" />} />',
    );
  });

  it("does not expose development preview sessions or construction placeholders", () => {
    expect(source).not.toContain("previewSession");
    expect(source).not.toContain("演示工作区");
    expect(source).not.toContain("模块建设中");
    expect(source).not.toContain("PagePlaceholder");
  });

  it.each([
    "/team",
    "/settings",
    "/analysis-jobs/:jobId",
    "/projects/:projectId/brand",
    "/projects/:projectId/website",
    "/projects/:projectId/optimization",
    "/projects/:projectId/assistant",
    "/projects/:projectId/history",
    "/projects/:projectId/settings",
    "/projects/:projectId/reports/:reportId",
  ])("provides a real route for %s", (route) => {
    expect(source).toContain(`path="${route}"`);
  });
});
