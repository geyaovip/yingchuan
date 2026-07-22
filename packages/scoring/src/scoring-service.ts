import {
  AuditOutcome,
  CompetitorStatus,
  MentionKind,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import {
  PARSER_VERSION,
  normalizeEntityName,
  parseResponse,
} from "./parser.js";
import {
  SCORE_VERSION,
  calculateScoreV1,
  type ScoreSample,
} from "./score-v1.js";

export class ScoringApplicationService {
  constructor(private readonly database: PrismaClient) {}

  async parseEvent(eventId: string): Promise<boolean> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "response.parse.requested") return false;
    const run = await this.database.modelRun.findUnique({
      include: {
        analysisJob: {
          include: {
            project: {
              include: { brandEntity: { include: { aliases: true } } },
            },
          },
        },
        result: true,
      },
      where: { id: event.aggregateId },
    });
    if (!run?.result) return false;
    const brand = run.analysisJob.project.brandEntity;
    const names = brand
      ? [brand.canonicalName, ...brand.aliases.map((item) => item.value)]
      : [run.analysisJob.project.name];
    const parsed = parseResponse(run.result.responseText, names);
    await this.database.$transaction(async (transaction) => {
      if (
        await transaction.inboxReceipt.findUnique({
          where: { consumer_eventId: { consumer: "response-parser", eventId } },
        })
      )
        return;
      await transaction.runParseResult.upsert({
        create: {
          averageConfidence: parsed.averageConfidence,
          id: uuidv7(),
          modelRunId: run.id,
          parserVersion: PARSER_VERSION,
          refused: parsed.refused,
          sentimentLabel: parsed.sentimentLabel,
          sentimentScore: parsed.sentimentScore,
          validSample: parsed.validSample,
        },
        update: {},
        where: { modelRunId: run.id },
      });
      for (const mention of parsed.mentions) {
        let competitorId: string | undefined;
        if (mention.kind === "competitor") {
          const normalizedName = normalizeEntityName(mention.name);
          const competitor = await transaction.competitor.upsert({
            create: {
              canonicalName: mention.name,
              evidenceCount: 1,
              id: uuidv7(),
              normalizedName,
              projectId: run.analysisJob.projectId,
            },
            update: { evidenceCount: { increment: 1 } },
            where: {
              projectId_normalizedName: {
                normalizedName,
                projectId: run.analysisJob.projectId,
              },
            },
          });
          if (competitor.status !== CompetitorStatus.excluded)
            competitorId = competitor.id;
        }
        await transaction.entityMention.create({
          data: {
            confidence: mention.confidence,
            competitorId,
            evidenceSnippet: mention.evidenceSnippet,
            id: uuidv7(),
            kind:
              mention.kind === "target"
                ? MentionKind.target
                : MentionKind.competitor,
            modelRunId: run.id,
            normalizedName: normalizeEntityName(mention.name),
            rank: mention.rank,
            rankInferred: mention.rankInferred,
            rawName: mention.name,
            recommended: mention.recommended,
          },
        });
        if (mention.confidence < 80)
          await transaction.entityReviewIssue.create({
            data: {
              confidence: mention.confidence,
              id: uuidv7(),
              issueType: "LOW_CONFIDENCE_ENTITY",
              modelRunId: run.id,
              projectId: run.analysisJob.projectId,
              subject: mention.name,
            },
          });
      }
      if (parsed.factClaims.length > 0)
        await transaction.factClaim.createMany({
          data: parsed.factClaims.map((claim) => ({
            claimText: claim.claimText,
            confidence: claim.confidence,
            evidenceSnippet: claim.evidenceSnippet,
            id: uuidv7(),
            modelRunId: run.id,
            subject: claim.subject,
          })),
        });
      await transaction.inboxReceipt.create({
        data: { consumer: "response-parser", eventId, id: uuidv7() },
      });
    });
    await this.calculateIfReady(run.analysisJobId);
    return true;
  }

  async calculateIfReady(jobId: string) {
    const existing = await this.database.visibilityScore.findUnique({
      where: {
        analysisJobId_scoreVersion: {
          analysisJobId: jobId,
          scoreVersion: SCORE_VERSION,
        },
      },
    });
    if (existing) return existing;
    const job = await this.database.analysisJob.findUnique({
      include: {
        runs: {
          include: {
            mentions: true,
            modelConfigVersion: true,
            parseResult: true,
            promptVersion: true,
          },
        },
      },
      where: { id: jobId },
    });
    if (!job || !["completed", "partially_completed"].includes(job.status))
      return null;
    const succeeded = job.runs.filter((run) => run.status === "succeeded");
    if (succeeded.some((run) => !run.parseResult)) return null;
    const samples: ScoreSample[] = succeeded
      .filter((run) => run.parseResult?.validSample)
      .map((run) => {
        const target = run.mentions.find(
          (item) => item.kind === MentionKind.target,
        );
        return {
          competitors: run.mentions
            .filter(
              (item) =>
                item.kind === MentionKind.competitor && item.recommended,
            )
            .map((item) => ({
              name: item.normalizedName,
              rank: item.rank ?? undefined,
            })),
          modelId: run.modelConfigVersion.modelConfigId,
          parseConfidence: Number(run.parseResult!.averageConfidence),
          promptId: run.promptVersion.promptId,
          rank: target?.rank ?? undefined,
          recommended: target?.recommended ?? false,
          targetMentioned: Boolean(target),
        };
      });
    const score = calculateScoreV1({
      eligibleModelIds: [
        ...new Set(job.runs.map((run) => run.modelConfigVersion.modelConfigId)),
      ],
      plannedPromptIds: [
        ...new Set(job.runs.map((run) => run.promptVersion.promptId)),
      ],
      plannedRunCount: job.totalRuns,
      samples,
    });
    return this.database.$transaction(async (transaction) => {
      const created = await transaction.visibilityScore.create({
        data: {
          analysisJobId: jobId,
          comparabilityHash: score.comparabilityHash,
          confidence: score.confidence,
          confidenceLevel: score.confidenceLevel,
          diagnosticOnly: score.diagnosticOnly,
          dimensions: {
            create: score.dimensions.map((item) => ({
              confidence: item.confidence,
              effectiveWeight: item.effectiveWeight,
              id: uuidv7(),
              dimensionCode: item.code,
              missingReason: item.missingReason,
              originalWeight: item.originalWeight,
              sampleSize: item.sampleSize,
              value: item.value,
            })),
          },
          id: uuidv7(),
          overallScore: score.overallScore,
          parserVersion: PARSER_VERSION,
          plannedRunCount: job.totalRuns,
          scoreVersion: SCORE_VERSION,
          validModelCount: score.validModelCount,
          validPromptCount: score.validPromptCount,
          validSampleCount: score.validSampleCount,
        },
        include: { dimensions: true },
      });
      const context = getRequestContext();
      await transaction.outboxEvent.create({
        data: {
          actorId: job.createdById,
          actorType: "user",
          aggregateId: created.id,
          aggregateType: "VisibilityScore",
          aggregateVersion: 1,
          id: uuidv7(),
          eventType: "report.generate.requested",
          idempotencyKey: `report.generate.requested/${created.id}`,
          payload: { visibilityScoreId: created.id },
          traceId: context?.traceId ?? "00000000000000000000000000000000",
          workspaceId: job.workspaceId,
        },
      });
      return created;
    });
  }

  async listScores(projectId: string, actorId: string) {
    await this.requireProject(projectId, actorId);
    const scores = await this.database.visibilityScore.findMany({
      include: { dimensions: true },
      orderBy: { calculatedAt: "desc" },
      where: {
        analysisJobId: {
          in: (
            await this.database.analysisJob.findMany({
              select: { id: true },
              where: { projectId },
            })
          ).map((item) => item.id),
        },
      },
    });
    return this.serialize(scores);
  }

  async listCompetitors(projectId: string, actorId: string) {
    await this.requireProject(projectId, actorId);
    return this.database.competitor.findMany({
      include: { aliases: true },
      orderBy: [{ status: "asc" }, { evidenceCount: "desc" }],
      where: { projectId },
    });
  }

  async updateCompetitor(
    projectId: string,
    competitorId: string,
    input: {
      canonicalName?: string;
      excludedReason?: string;
      status: CompetitorStatus;
      version: number;
    },
    actorId: string,
  ) {
    const membership = await this.requireProject(
      projectId,
      actorId,
      "project.manage",
    );
    return this.database.$transaction(async (transaction) => {
      const before = await transaction.competitor.findFirst({
        where: { id: competitorId, projectId, version: input.version },
      });
      if (!before) throw new Error("CONCURRENT_MODIFICATION");
      const canonicalName = input.canonicalName?.trim();
      const result = await transaction.competitor.update({
        data: {
          canonicalName,
          normalizedName: canonicalName
            ? normalizeEntityName(canonicalName)
            : undefined,
          excludedReason:
            input.status === CompetitorStatus.excluded
              ? input.excludedReason?.trim()
              : null,
          status: input.status,
          version: { increment: 1 },
        },
        include: { aliases: true },
        where: { id: competitorId },
      });
      const context = getRequestContext();
      await transaction.auditLog.create({
        data: {
          action: "competitor.update",
          actorId,
          actorType: "user",
          id: uuidv7(),
          objectId: competitorId,
          objectType: "Competitor",
          outcome: AuditOutcome.success,
          riskLevel: "low",
          requestId: context?.requestId ?? uuidv7(),
          traceId: context?.traceId ?? "00000000000000000000000000000000",
          workspaceId: membership.workspaceId,
          beforeSummary: {
            canonicalName: before.canonicalName,
            status: before.status,
          },
          afterSummary: {
            canonicalName: result.canonicalName,
            status: result.status,
          },
        },
      });
      return result;
    });
  }

  private async requireProject(
    projectId: string,
    actorId: string,
    permission = "report.view",
  ) {
    const membership = await this.database.workspaceMembership.findFirst({
      where: {
        role: {
          rolePermissions: { some: { permission: { code: permission } } },
        },
        status: "active",
        userId: actorId,
        workspace: { projects: { some: { id: projectId } } },
      },
    });
    if (!membership) throw new Error("RESOURCE_NOT_FOUND");
    return membership;
  }

  private serialize(value: unknown) {
    return JSON.parse(
      JSON.stringify(value, (_, item: unknown) =>
        typeof item === "object" && item && "toNumber" in item
          ? (item as { toNumber(): number }).toNumber()
          : item,
      ),
    ) as unknown;
  }
}
