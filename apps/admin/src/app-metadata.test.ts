import { describe, expect, it } from "vitest";

import { appMetadata } from "./app-metadata";

describe("admin metadata", () => {
  it("identifies the admin surface", () => {
    expect(appMetadata.surface).toBe("admin");
  });
});
