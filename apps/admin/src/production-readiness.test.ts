import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("admin production route contract", () => {
  it("redirects shared shell home links to the admin dashboard", () => {
    expect(source).toContain(
      '<Route path="/dashboard" element={<Navigate replace to="/admin" />} />',
    );
  });

  it("does not expose development preview sessions or construction placeholders", () => {
    expect(source).not.toContain("previewSession");
    expect(source).not.toContain("模块建设中");
    expect(source).not.toContain("AdminPlaceholder");
  });

  it.each([
    "/admin/users",
    "/admin/workspaces",
    "/admin/projects",
    "/admin/tasks",
    "/admin/models",
    "/admin/agent",
    "/admin/agent/runs",
    "/admin/alerts",
    "/admin/alert-rules",
    "/admin/notification-channels",
    "/admin/usage",
    "/admin/audit-logs",
  ])("provides a real route for %s", (route) => {
    expect(source).toContain(`path="${route}"`);
  });
});
