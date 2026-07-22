import { describe, expect, it } from "vitest";

import {
  DataLifecycleError,
  isScopeHeld,
  resolvePrivateFilePath,
} from "./lifecycle-service.js";

describe("data lifecycle safety primitives", () => {
  it("honors both workspace and project legal holds", () => {
    const holds = new Set(["workspace:workspace-1", "project:project-2"]);
    expect(isScopeHeld(holds, "workspace-1", "project-1")).toBe(true);
    expect(isScopeHeld(holds, "workspace-2", "project-2")).toBe(true);
    expect(isScopeHeld(holds, "workspace-2", "project-3")).toBe(false);
  });

  it("only resolves private files below the configured root", () => {
    expect(resolvePrivateFilePath("/srv/private", "snapshots/a.txt")).toBe(
      "/srv/private/snapshots/a.txt",
    );
    expect(() =>
      resolvePrivateFilePath("/srv/private", "../other.txt"),
    ).toThrow(DataLifecycleError);
    expect(() => resolvePrivateFilePath("/srv/private", "/etc/passwd")).toThrow(
      DataLifecycleError,
    );
  });
});
