import { createHash } from "node:crypto";
import type { PrismaClient } from "@yingchuan/database";
import { AnalysisServiceError } from "./analysis-service.js";

export interface InsightSample {
  id: string;
  jobId: string;
  modelId: string;
  modelName: string;
  modelVersionId: string;
  promptId: string;
  promptVersionId: string;
  promptText: string;
  group: string;
  valid: boolean;
  condition: string;
  mentions: readonly {
    kind: string;
    competitorId: string | null;
    recommended: boolean;
    rank: number | null;
    rankInferred: boolean;
  }[];
  citations: unknown;
}

export function sampleMetrics(
  samples: readonly InsightSample[],
  competitorId?: string,
) {
  const valid = samples.filter((sample) => sample.valid);
  let mentioned = 0,
    recommended = 0;
  const ranks: number[] = [];
  for (const sample of valid) {
    const mentions = sample.mentions.filter((mention) =>
      competitorId
        ? mention.competitorId === competitorId
        : mention.kind === "target",
    );
    if (mentions.length) mentioned++;
    if (mentions.some((mention) => mention.recommended)) recommended++;
    const rank = mentions
      .filter((mention) => !mention.rankInferred && mention.rank !== null)
      .map((mention) => mention.rank!)
      .sort((a, b) => a - b)[0];
    if (rank !== undefined) ranks.push(rank);
  }
  const percent = (value: number) =>
    valid.length ? Math.round((value / valid.length) * 1000) / 10 : null;
  return {
    validSamples: valid.length,
    invalidSamples: samples.length - valid.length,
    mentioned,
    recommended,
    mentionRate: percent(mentioned),
    recommendationRate: percent(recommended),
    averageRank: ranks.length
      ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10
      : null,
    rankSamples: ranks.length,
  };
}

export function canonicalCitation(
  value: unknown,
): { url: string; domain: string; title: string } | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("url" in value) ||
    typeof value.url !== "string"
  )
    return;
  try {
    const url = new URL(value.url);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^utm_|^(gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return {
      url: url.href,
      domain: url.hostname.toLowerCase(),
      title:
        "title" in value && typeof value.title === "string"
          ? value.title.slice(0, 300)
          : url.hostname,
    };
  } catch {
    return;
  }
}

export function conditionHash(
  samples: readonly InsightSample[],
  scoreVersion: string,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scoreVersion,
        conditions: [
          ...new Set(samples.map((sample) => sample.condition)),
        ].sort(),
      }),
    )
    .digest("hex");
}

export function citationRanking(samples: readonly InsightSample[]) {
  const domains = new Map<
    string,
    {
      domain: string;
      count: number;
      modelCounts: Record<string, number>;
      evidence: { jobId: string; runId: string }[];
    }
  >();
  const articles = new Map<
    string,
    {
      url: string;
      domain: string;
      title: string;
      count: number;
      modelCounts: Record<string, number>;
      evidence: { jobId: string; runId: string }[];
    }
  >();
  for (const sample of samples.filter((item) => item.valid)) {
    const seenDomains = new Set<string>(),
      seenArticles = new Set<string>();
    for (const value of Array.isArray(sample.citations)
      ? sample.citations
      : []) {
      const citation = canonicalCitation(value);
      if (!citation) continue;
      const evidence = { jobId: sample.jobId, runId: sample.id };
      if (!seenDomains.has(citation.domain)) {
        const row = domains.get(citation.domain) ?? {
          domain: citation.domain,
          count: 0,
          modelCounts: {},
          evidence: [],
        };
        row.count++;
        row.modelCounts[sample.modelId] =
          (row.modelCounts[sample.modelId] ?? 0) + 1;
        if (row.evidence.length < 5) row.evidence.push(evidence);
        domains.set(citation.domain, row);
        seenDomains.add(citation.domain);
      }
      if (!seenArticles.has(citation.url)) {
        const row = articles.get(citation.url) ?? {
          ...citation,
          count: 0,
          modelCounts: {},
          evidence: [],
        };
        row.count++;
        row.modelCounts[sample.modelId] =
          (row.modelCounts[sample.modelId] ?? 0) + 1;
        if (row.evidence.length < 5) row.evidence.push(evidence);
        articles.set(citation.url, row);
        seenArticles.add(citation.url);
      }
    }
  }
  return {
    domains: [...domains.values()].sort(
      (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
    ),
    articles: [...articles.values()].sort(
      (a, b) => b.count - a.count || a.url.localeCompare(b.url),
    ),
  };
}

export class InsightsApplicationService {
  constructor(private readonly database: PrismaClient) {}

  async get(
    projectId: string,
    actorId: string,
    filters: {
      days: number;
      modelId?: string;
      promptId?: string;
      group?: string;
    },
  ) {
    const project = await this.database.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          memberships: {
            some: {
              userId: actorId,
              status: "active",
              user: { status: "active" },
              role: {
                rolePermissions: {
                  some: { permission: { code: "report.view" } },
                },
              },
            },
          },
        },
      },
    });
    if (!project) throw new AnalysisServiceError("RESOURCE_NOT_FOUND", 404);
    const since = new Date(Date.now() - filters.days * 86_400_000);
    const jobs = await this.database.analysisJob.findMany({
      where: {
        projectId,
        createdAt: { gte: since },
        status: {
          in: ["completed", "partially_completed", "failed", "cancelled"],
        },
      },
      orderBy: { createdAt: "asc" },
      take: 501,
      include: {
        runs: {
          include: {
            promptVersion: true,
            modelConfigVersion: {
              include: {
                modelConfig: { select: { id: true, displayName: true } },
              },
            },
            parseResult: true,
            mentions: true,
            result: { select: { citations: true, finishReason: true } },
          },
        },
      },
    });
    if (
      jobs.length > 500 ||
      jobs.reduce((sum, job) => sum + job.runs.length, 0) > 20_000
    )
      throw new AnalysisServiceError("INSIGHTS_RANGE_TOO_LARGE", 400);
    const scores = await this.database.visibilityScore.findMany({
      where: { analysisJobId: { in: jobs.map((job) => job.id) } },
    });
    const scoreByJob = new Map(
      scores.map((score) => [score.analysisJobId, score]),
    );
    const samples: InsightSample[] = jobs.flatMap((job) =>
      job.runs.map((run) => ({
        id: run.id,
        jobId: job.id,
        modelId: run.modelConfigVersion.modelConfigId,
        modelName: run.modelConfigVersion.modelConfig.displayName,
        modelVersionId: run.modelConfigVersionId,
        promptId: run.promptVersion.promptId,
        promptVersionId: run.promptVersionId,
        promptText: run.promptTextSnapshot,
        group: run.promptVersion.groupKey ?? "未分组",
        valid:
          run.status === "succeeded" &&
          Boolean(run.parseResult?.validSample) &&
          run.result?.finishReason !== "length",
        condition: JSON.stringify([
          run.promptVersionId,
          run.modelConfigVersionId,
          run.scopeHash,
          run.nativeWebSearchEnabled,
          run.webSearchToolVersion,
          run.parseResult?.parserVersion ?? "pending",
        ]),
        mentions: run.mentions,
        citations: run.result?.citations,
      })),
    );
    const filtered = samples.filter(
      (sample) =>
        (!filters.modelId || sample.modelId === filters.modelId) &&
        (!filters.promptId || sample.promptId === filters.promptId) &&
        (!filters.group || sample.group === filters.group),
    );
    const options = {
      models: [
        ...new Map(
          samples.map((sample) => [
            sample.modelId,
            { id: sample.modelId, name: sample.modelName },
          ]),
        ).values(),
      ],
      prompts: [
        ...new Map(
          samples.map((sample) => [
            sample.promptId,
            { id: sample.promptId, text: sample.promptText },
          ]),
        ).values(),
      ],
      groups: [...new Set(samples.map((sample) => sample.group))].sort(),
    };
    const groupRows = (
      key: (sample: InsightSample) => string,
      name: (sample: InsightSample) => string,
    ) => {
      const groups = new Map<string, InsightSample[]>();
      for (const sample of filtered) {
        const id = key(sample);
        groups.set(id, [...(groups.get(id) ?? []), sample]);
      }
      return [...groups.entries()]
        .map(([id, rows]) => ({
          id,
          name: name(rows[0]!),
          ...sampleMetrics(rows),
          evidence: rows
            .filter((row) => row.valid)
            .slice(0, 3)
            .map((row) => ({ jobId: row.jobId, runId: row.id })),
        }))
        .sort((a, b) => (b.mentionRate ?? -1) - (a.mentionRate ?? -1));
    };
    const competitors = await this.database.competitor.findMany({
      where: { projectId, status: "confirmed" },
      orderBy: { normalizedName: "asc" },
    });
    const trends = jobs
      .map((job) => {
        const rows = filtered.filter((sample) => sample.jobId === job.id);
        const score = scoreByJob.get(job.id);
        return {
          jobId: job.id,
          at: job.createdAt.toISOString(),
          cohort: conditionHash(rows, score?.scoreVersion ?? "unscored"),
          scoreVersion: score?.scoreVersion ?? null,
          diagnosticOnly:
            !score ||
            score.diagnosticOnly ||
            rows.filter((row) => row.valid).length < 20 ||
            new Set(
              rows.filter((row) => row.valid).map((row) => row.promptVersionId),
            ).size < 5 ||
            new Set(
              rows.filter((row) => row.valid).map((row) => row.modelVersionId),
            ).size < 2,
          score:
            !filters.modelId && !filters.promptId && !filters.group && score
              ? Number(score.overallScore)
              : null,
          ...sampleMetrics(rows),
        };
      })
      .filter((point) => point.validSamples + point.invalidSamples > 0);
    const citations = citationRanking(filtered);
    return {
      projectId,
      timezone: project.timezone,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      summary: sampleMetrics(filtered),
      options,
      models: groupRows(
        (row) => row.modelId,
        (row) => row.modelName,
      ),
      prompts: groupRows(
        (row) => row.promptId,
        (row) => row.promptText,
      ),
      groups: groupRows(
        (row) => row.group,
        (row) => row.group,
      ),
      competitors: competitors.map((row) => ({
        id: row.id,
        name: row.normalizedName,
        ...sampleMetrics(filtered, row.id),
        evidence: filtered
          .filter(
            (sample) =>
              sample.valid &&
              sample.mentions.some(
                (mention) => mention.competitorId === row.id,
              ),
          )
          .slice(0, 3)
          .map((sample) => ({ jobId: sample.jobId, runId: sample.id })),
      })),
      trends,
      citations,
    };
  }
}
