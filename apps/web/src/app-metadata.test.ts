import { describe, expect, it } from "vitest";

import { appMetadata } from "./app-metadata";

describe("web metadata", () => {
  it("identifies the user surface", () => {
    expect(appMetadata.surface).toBe("web");
  });
});
