import { describe, expect, it } from "vitest";

import { assertTestFixtureTarget } from "./fixture-safety.js";

describe("assertTestFixtureTarget", () => {
  it("accepts only the dedicated test database", () => {
    expect(() =>
      assertTestFixtureTarget("test", "yingchuan_test"),
    ).not.toThrow();
  });

  it.each([
    ["production", "yingchuan_test"],
    ["development", "yingchuan_test"],
    ["test", "yingchuan"],
    [undefined, "yingchuan_test"],
  ])("rejects environment %s and database %s", (nodeEnv, databaseName) => {
    expect(() => assertTestFixtureTarget(nodeEnv, databaseName)).toThrow(
      "Test fixtures can only run",
    );
  });
});
