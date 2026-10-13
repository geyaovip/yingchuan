import { describe, expect, it } from "vitest";
import {
  canonicalCitation,
  citationRanking,
  conditionHash,
  sampleMetrics,
  type InsightSample,
} from "./insights-service.js";
import { nextMonitoringAt } from "./monitoring-service.js";
const sample = (patch: Partial<InsightSample> = {}): InsightSample => ({
  id: "run-1",
  jobId: "job-1",
  modelId: "model-1",
  modelName: "模型一",
  modelVersionId: "model-version-1",
  promptId: "prompt-1",
  promptVersionId: "prompt-version-1",
  promptText: "推荐哪些品牌",
  group: "通用",
  valid: true,
  condition: "frozen-condition-1",
  mentions: [],
  citations: [],
  ...patch,
});
const mention = (patch = {}) => ({
  kind: "target",
  competitorId: null,
  recommended: true,
  rank: 1,
  rankInferred: false,
  ...patch,
});
describe("real-answer insights", () => {
  it("uses valid answers as denominator and counts one brand per answer", () => {
    const metrics = sampleMetrics([
      sample({ mentions: [mention(), mention()] }),
      sample({ id: "run-2" }),
      sample({ id: "failed", valid: false, mentions: [mention()] }),
    ]);
    expect(metrics).toMatchObject({
      validSamples: 2,
      invalidSamples: 1,
      mentioned: 1,
      recommended: 1,
      mentionRate: 50,
      recommendationRate: 50,
      rankSamples: 1,
      averageRank: 1,
    });
  });
  it("does not infer rank or treat mention as recommendation", () => {
    const metrics = sampleMetrics([
      sample({
        mentions: [
          mention({ recommended: false, rank: 3, rankInferred: true }),
        ],
      }),
    ]);
    expect(metrics).toMatchObject({
      mentionRate: 100,
      recommendationRate: 0,
      averageRank: null,
      rankSamples: 0,
    });
    expect(sampleMetrics([])).toMatchObject({
      mentionRate: null,
      recommendationRate: null,
      averageRank: null,
    });
  });
  it("compares confirmed competitor against the same full denominator", () => {
    expect(
      sampleMetrics(
        [
          sample({
            mentions: [
              mention({ kind: "competitor", competitorId: "competitor-1" }),
            ],
          }),
          sample(),
        ],
        "competitor-1",
      ).recommendationRate,
    ).toBe(50);
  });
  it("canonicalizes only tracking parameters and rejects executable and credential URLs", () => {
    expect(
      canonicalCitation({
        url: "https://News.example.cn/a?id=3&utm_source=x#section",
      })?.url,
    ).toBe("https://news.example.cn/a?id=3");
    expect(canonicalCitation({ url: "javascript:alert(1)" })).toBeUndefined();
    expect(
      canonicalCitation({ url: "https://user:secret@example.cn/a" }),
    ).toBeUndefined();
    expect(canonicalCitation({ url: "not a URL" })).toBeUndefined();
  });
  it("deduplicates per-answer domain/article and exposes actual model counts", () => {
    const citation = { url: "https://example.cn/a" };
    const ranking = citationRanking([
      sample({
        citations: [
          citation,
          { url: "https://example.cn/a?utm_source=foo" },
          { url: "https://example.cn/b" },
        ],
      }),
      sample({ id: "run-2", modelId: "model-2", citations: [citation] }),
      sample({ id: "failed", valid: false, citations: [citation] }),
    ]);
    expect(ranking.domains[0]).toMatchObject({
      count: 2,
      modelCounts: { "model-1": 1, "model-2": 1 },
    });
    expect(
      ranking.articles.find((row) => row.url === citation.url)?.count,
    ).toBe(2);
    expect(ranking.articles).toHaveLength(2);
  });
  it("keeps versions and scoring rules in separate comparison groups", () => {
    expect(
      conditionHash([sample(), sample({ condition: "second" })], "v1"),
    ).toBe(conditionHash([sample({ condition: "second" }), sample()], "v1"));
    expect(conditionHash([sample()], "v1")).not.toBe(
      conditionHash([sample({ condition: "changed-model-version" })], "v1"),
    );
    expect(conditionHash([sample()], "v1")).not.toBe(
      conditionHash([sample()], "v2"),
    );
  });
});
describe("UTC monitoring schedule", () => {
  it("runs at the configured project local time", () => {
    expect(
      nextMonitoringAt(
        {
          frequency: "daily",
          hour: 9,
          minute: 30,
          weekday: 1,
          timezone: "Asia/Shanghai",
        },
        new Date("2026-10-13T01:29:59Z"),
      ).toISOString(),
    ).toBe("2026-10-13T01:30:00.000Z");
  });
  it("uses the next occurrence after a completed execution", () => {
    expect(
      nextMonitoringAt(
        {
          frequency: "weekly",
          hour: 9,
          minute: 0,
          weekday: 2,
          timezone: "Asia/Shanghai",
        },
        new Date("2026-10-13T01:00:00Z"),
      ).toISOString(),
    ).toBe("2026-10-20T01:00:00.000Z");
  });
  it("skips a nonexistent wall-clock time during daylight saving", () => {
    expect(
      nextMonitoringAt(
        {
          frequency: "daily",
          hour: 2,
          minute: 30,
          weekday: 0,
          timezone: "America/New_York",
        },
        new Date("2026-03-08T05:00:00Z"),
      ).toISOString(),
    ).toBe("2026-03-09T06:30:00.000Z");
  });
});
