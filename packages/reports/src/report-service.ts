import { ReportVersionStatus, type PrismaClient } from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

export class ReportApplicationService {
  constructor(private readonly database: PrismaClient) {}

  async generateEvent(eventId: string): Promise<boolean> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "report.generate.requested") return false;
    const score = await this.database.visibilityScore.findUnique({
      include: {
        dimensions: true,
      },
      where: { id: event.aggregateId },
    });
    if (!score) return false;
    const job = await this.database.analysisJob.findUnique({
      include: {
        project: true,
        runs: {
          include: {
            mentions: true,
            modelConfigVersion: { include: { modelConfig: true } },
            promptVersion: true,
            result: true,
          },
        },
      },
      where: { id: score.analysisJobId },
    });
    if (!job) return false;
    await this.database.$transaction(async (transaction) => {
      if (
        await transaction.inboxReceipt.findUnique({
          where: {
            consumer_eventId: { consumer: "report-generator", eventId },
          },
        })
      )
        return;
      const report = await transaction.report.upsert({
        create: { id: uuidv7(), projectId: job.projectId },
        update: {},
        where: { projectId: job.projectId },
      });
      const latest = await transaction.reportVersion.aggregate({
        _max: { versionNumber: true },
        where: { reportId: report.id },
      });
      const limitations = [
        job.status === "partially_completed"
          ? `本次 ${job.failedRuns + job.skippedRuns} 个样本未成功，结论仅基于成功样本。`
          : undefined,
        score.diagnosticOnly
          ? "样本量或覆盖不足，当前结果仅用于诊断，不应直接解读为稳定趋势。"
          : undefined,
      ]
        .filter(Boolean)
        .join(" ");
      const version = await transaction.reportVersion.create({
        data: {
          contentSnapshot: {
            analysisJobId: job.id,
            comparabilityHash: score.comparabilityHash,
            confidence: Number(score.confidence),
            dimensions: score.dimensions.map((item) => ({
              code: item.dimensionCode,
              confidence: Number(item.confidence),
              missingReason: item.missingReason,
              sampleSize: item.sampleSize,
              value: item.value === null ? null : Number(item.value),
            })),
            failedRuns: job.failedRuns,
            modelBreakdown: job.runs.map((run) => ({
              model: run.modelConfigVersion.modelConfig.displayName,
              prompt: run.promptVersion.text,
              status: run.status,
              citations: run.result?.citations ?? [],
            })),
            overallScore: Number(score.overallScore),
            parserVersion: score.parserVersion,
            plannedRuns: score.plannedRunCount,
            scoreVersion: score.scoreVersion,
            successfulRuns: job.succeededRuns,
          },
          generatedAt: new Date(),
          id: uuidv7(),
          limitationSummary: limitations || null,
          reportId: report.id,
          status: ReportVersionStatus.ready,
          title: `${job.project.name} AI 可见度报告`,
          versionNumber: (latest._max.versionNumber ?? 0) + 1,
          visibilityScoreId: score.id,
          recommendations: {
            create: recommendations(score.dimensions).map((item, index) => ({
              ...item,
              id: uuidv7(),
              sortOrder: index,
            })),
          },
        },
      });
      await transaction.inboxReceipt.create({
        data: { consumer: "report-generator", eventId, id: uuidv7() },
      });
      await transaction.outboxEvent.create({
        data: {
          actorId: job.createdById,
          actorType: "user",
          aggregateId: version.id,
          aggregateType: "ReportVersion",
          aggregateVersion: version.versionNumber,
          eventType: "report.ready",
          id: uuidv7(),
          idempotencyKey: `report.ready/${version.id}`,
          payload: { projectId: job.projectId, reportVersionId: version.id },
          traceId:
            getRequestContext()?.traceId ?? "00000000000000000000000000000000",
          workspaceId: job.workspaceId,
        },
      });
    });
    return true;
  }

  async list(projectId: string, actorId: string) {
    await this.requireProject(projectId, actorId);
    return this.serialize(
      await this.database.reportVersion.findMany({
        include: {
          recommendations: { orderBy: { sortOrder: "asc" } },
          visibilityScore: { include: { dimensions: true } },
        },
        orderBy: { versionNumber: "desc" },
        where: { report: { projectId } },
      }),
    );
  }

  async detail(
    projectId: string,
    versionId: string,
    actorId: string,
    requestId?: string,
  ) {
    await this.requireProject(projectId, actorId);
    const version = await this.database.reportVersion.findFirst({
      include: {
        recommendations: { orderBy: { sortOrder: "asc" } },
        visibilityScore: { include: { dimensions: true } },
      },
      where: {
        id: versionId,
        report: { projectId },
        status: { in: ["ready", "published", "archived"] },
      },
    });
    if (!version) throw new Error("RESOURCE_NOT_FOUND");
    await this.database.reportViewEvent.create({
      data: {
        id: uuidv7(),
        reportVersionId: version.id,
        requestId: requestId ?? getRequestContext()?.requestId ?? uuidv7(),
        userId: actorId,
      },
    });
    return this.serialize(version);
  }

  async transition(
    projectId: string,
    versionId: string,
    action: "archive" | "publish",
    actorId: string,
  ) {
    const membership = await this.requireProject(
      projectId,
      actorId,
      "project.manage",
    );
    return this.database.$transaction(async (transaction) => {
      const version = await transaction.reportVersion.findFirst({
        where: { id: versionId, report: { projectId } },
      });
      if (!version) throw new Error("RESOURCE_NOT_FOUND");
      const status =
        action === "publish"
          ? ReportVersionStatus.published
          : ReportVersionStatus.archived;
      if (action === "publish" && version.status !== "ready")
        throw new Error("INVALID_STATE_TRANSITION");
      if (
        action === "archive" &&
        !["ready", "published"].includes(version.status)
      )
        throw new Error("INVALID_STATE_TRANSITION");
      const updated = await transaction.reportVersion.update({
        data: {
          archivedAt: action === "archive" ? new Date() : undefined,
          publishedAt: action === "publish" ? new Date() : undefined,
          status,
        },
        where: { id: versionId },
      });
      const context = getRequestContext();
      await transaction.auditLog.create({
        data: {
          action: `report.${action}`,
          actorId,
          actorType: "user",
          id: uuidv7(),
          objectId: versionId,
          objectType: "ReportVersion",
          outcome: "success",
          riskLevel: "low",
          requestId: context?.requestId ?? uuidv7(),
          traceId: context?.traceId ?? "00000000000000000000000000000000",
          workspaceId: membership.workspaceId,
        },
      });
      return updated;
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
        typeof item === "bigint"
          ? item.toString()
          : typeof item === "object" && item && "toNumber" in item
            ? (item as { toNumber(): number }).toNumber()
            : item,
      ),
    ) as unknown;
  }
}

function recommendations(
  dimensions: readonly { dimensionCode: string; value: unknown }[],
) {
  return dimensions
    .filter((item) => item.value !== null && Number(item.value) < 70)
    .sort((a, b) => Number(a.value) - Number(b.value))
    .slice(0, 4)
    .map((item, index) => ({
      category: item.dimensionCode,
      description: `针对 ${item.dimensionCode} 的低分样本，补充可验证内容并保持品牌实体与关键信息一致。`,
      effort: index === 0 ? "medium" : "low",
      evidence: { dimension: item.dimensionCode, score: Number(item.value) },
      impact: "改善相关 Prompt 与模型中的品牌可见度和答案质量。",
      priority:
        index === 0
          ? ("P0" as const)
          : index === 1
            ? ("P1" as const)
            : ("P2" as const),
      title: `提升 ${item.dimensionCode}`,
    }));
}
