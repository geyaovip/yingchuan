export function assertTestFixtureTarget(
  nodeEnv: string | undefined,
  databaseName: string,
): void {
  if (nodeEnv !== "test" || databaseName !== "yingchuan_test") {
    throw new Error(
      "Test fixtures can only run with NODE_ENV=test against yingchuan_test.",
    );
  }
}
