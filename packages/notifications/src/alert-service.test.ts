import { describe, expect, it } from "vitest";

import { evaluateAlertRules } from "./alert-service.js";

const healthy = {
  hourlyCostBaselineMicros: 1_000,
  hourlyCostCurrentMicros: 1_100,
  modelCallFailures: 1,
  modelCallTotal: 20,
  queuedOverTenMinutes: 499,
  reportAverageLatencySeconds: 299,
  reportSampleCount: 2,
};

describe("deterministic alert rules", () => {
  it("does not trigger below the documented thresholds", () => {
    expect(evaluateAlertRules(healthy).every((item) => !item.triggered)).toBe(
      true,
    );
  });

  it("triggers each P1 rule at its threshold", () => {
    const evaluations = evaluateAlertRules({
      ...healthy,
      hourlyCostCurrentMicros: 1_500,
      modelCallFailures: 2,
      queuedOverTenMinutes: 500,
      reportAverageLatencySeconds: 300,
    });
    expect(evaluations.map((item) => [item.ruleCode, item.triggered])).toEqual([
      ["model_failure_rate_5m", true],
      ["queue_waiting_10m", true],
      ["model_cost_hourly", true],
      ["report_latency_15m", true],
    ]);
  });

  it("skips cost and latency alerts without a valid baseline or sample", () => {
    const evaluations = evaluateAlertRules({
      ...healthy,
      hourlyCostBaselineMicros: 0,
      hourlyCostCurrentMicros: 50_000,
      reportAverageLatencySeconds: 999,
      reportSampleCount: 0,
    });
    expect(
      evaluations.find((item) => item.ruleCode === "model_cost_hourly")
        ?.triggered,
    ).toBe(false);
    expect(
      evaluations.find((item) => item.ruleCode === "report_latency_15m")
        ?.triggered,
    ).toBe(false);
  });
});
