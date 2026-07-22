import { createHash } from "node:crypto";

import {
  AliasStatus,
  AuditOutcome,
  CandidateSource,
  CandidateStatus,
  FetchJobStatus,
  KnowledgeSourceStatus,
  KnowledgeSourceType,
  MembershipStatus,
  OnboardingStatus,
  ProjectStatus,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import { normalizePublicUrl } from "./url-safety.js";
import { SafeFetchError, SafeWebFetcher } from "./safe-fetcher.js";

export interface ProjectActor {
  readonly email: string;
  readonly userId: string;
}

export interface CreateProjectInput {
  readonly defaultCountry?: string;
  readonly defaultLanguage?: string;
  readonly industryId?: string;
  readonly name: string;
  readonly timezone?: string;
  readonly websiteUrl?: string;
  readonly workspaceId: string;
}

export interface ConfirmIdentificationInput {
  readonly aliases?: readonly string[];
  readonly candidateId: string;
  readonly canonicalName?: string;
  readonly country?: string;
  readonly officialWebsite?: string;
  readonly primaryLanguage?: string;
}

export class ProjectServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(code);
    this.name = "ProjectServiceError";
  }
}

const projectInclude = {
  brandCandidates: { orderBy: { createdAt: "asc" as const } },
  brandEntity: {
    include: {
      aliases: true,
      versions: { orderBy: { versionNumber: "desc" as const }, take: 1 },
    },
  },
  capabilities: { orderBy: { code: "asc" as const } },
  identificationJobs: { orderBy: { createdAt: "desc" as const }, take: 1 },
  knowledgeSources: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ProjectInclude;

export class ProjectApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly fetcher = new SafeWebFetcher(),
  ) {}

  async create(
    input: CreateProjectInput,
    actor: ProjectActor,
    idempotencyKey: string,
  ) {
    await this.requirePermission(
      input.workspaceId,
      actor.userId,
      "project.manage",
    );
    const normalized = this.normalizeCreateInput(input);
    const requestHash = this.hash(normalized);
    const existing = await this.database.idempotencyRecord.findUnique({
      where: {
        scope_actorId_key: {
          actorId: actor.userId,
          key: idempotencyKey,
          scope: "project.create",
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new ProjectServiceError("IDEMPOTENCY_CONFLICT", 409);
      return this.get(existing.resourceId, actor.userId);
    }

    const projectId = uuidv7();
    const jobId = uuidv7();
    const candidateId = uuidv7();
    const context = this.context();
    try {
      return await this.database.$transaction(
        async (transaction) => {
          if (normalized.industryId) {
            const industry = await transaction.industry.findFirst({
              where: { enabled: true, id: normalized.industryId },
            });
            if (!industry)
              throw new ProjectServiceError("VALIDATION_FAILED", 400);
          }
          await transaction.project.create({
            data: {
              createdById: actor.userId,
              defaultCountry: normalized.defaultCountry,
              defaultLanguage: normalized.defaultLanguage,
              id: projectId,
              industryId: normalized.industryId,
              name: normalized.name,
              onboardingStatus: OnboardingStatus.identification_queued,
              status: ProjectStatus.identifying,
              timezone: normalized.timezone,
              workspaceId: normalized.workspaceId,
            },
          });
          await transaction.brandCandidate.create({
            data: {
              confidence: "1.0000",
              country: normalized.defaultCountry,
              displayName: normalized.name,
              id: candidateId,
              normalizedName: this.normalizeName(normalized.name),
              officialWebsite: normalized.websiteUrl,
              projectId,
              source: CandidateSource.user_input,
            },
          });
          if (normalized.websiteUrl) {
            await transaction.knowledgeSource.create({
              data: {
                confirmedAt: new Date(),
                confirmedById: actor.userId,
                id: uuidv7(),
                normalizedUrl: normalized.websiteUrl,
                originalUrl: input.websiteUrl!,
                projectId,
                status: KnowledgeSourceStatus.confirmed,
                type: KnowledgeSourceType.official_website,
              },
            });
          }
          await transaction.identificationJob.create({
            data: {
              id: jobId,
              idempotencyKey: `project-identification/${projectId}/1`,
              projectId,
            },
          });
          await transaction.outboxEvent.create({
            data: {
              actorId: actor.userId,
              actorType: "user",
              aggregateId: projectId,
              aggregateType: "Project",
              aggregateVersion: 1,
              eventType: "project.identification.requested",
              id: uuidv7(),
              idempotencyKey: `project.identification.requested/${jobId}`,
              payload: {
                jobId,
                projectId,
                userCandidateId: candidateId,
                nativeDiscoveryRequested: !normalized.websiteUrl,
              },
              traceId: context.traceId,
              workspaceId: normalized.workspaceId,
            },
          });
          await transaction.idempotencyRecord.create({
            data: {
              actorId: actor.userId,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              id: uuidv7(),
              key: idempotencyKey,
              requestHash,
              resourceId: projectId,
              resourceType: "Project",
              scope: "project.create",
            },
          });
          await this.audit(
            transaction,
            actor,
            "project.create",
            projectId,
            normalized.workspaceId,
          );
          return transaction.project.findUniqueOrThrow({
            include: projectInclude,
            where: { id: projectId },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        const record = await this.database.idempotencyRecord.findUnique({
          where: {
            scope_actorId_key: {
              actorId: actor.userId,
              key: idempotencyKey,
              scope: "project.create",
            },
          },
        });
        if (record?.requestHash === requestHash)
          return this.get(record.resourceId, actor.userId);
        throw new ProjectServiceError("IDEMPOTENCY_CONFLICT", 409);
      }
      throw error;
    }
  }

  async list(workspaceId: string, actorId: string) {
    await this.membership(workspaceId, actorId);
    return this.database.project.findMany({
      include: projectInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      where: { workspaceId },
    });
  }

  async get(projectId: string, actorId: string) {
    const project = await this.database.project.findFirst({
      include: projectInclude,
      where: {
        id: projectId,
        workspace: {
          memberships: {
            some: { status: MembershipStatus.active, userId: actorId },
          },
        },
      },
    });
    if (!project) throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
    return project;
  }

  async getIdentificationJob(
    projectId: string,
    jobId: string,
    actorId: string,
  ) {
    await this.get(projectId, actorId);
    const job = await this.database.identificationJob.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
    return job;
  }

  async update(
    projectId: string,
    input: { name: string; version: number },
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "project.manage",
    );
    if (project.status === ProjectStatus.archived)
      throw new ProjectServiceError("PROJECT_ARCHIVED", 409);
    const result = await this.database.$transaction(async (transaction) => {
      const updated = await transaction.project.updateMany({
        data: { name: input.name.trim(), version: { increment: 1 } },
        where: { id: projectId, version: input.version },
      });
      if (updated.count !== 1)
        throw new ProjectServiceError("CONCURRENT_MODIFICATION", 409);
      await this.audit(
        transaction,
        actor,
        "project.update",
        projectId,
        project.workspaceId,
      );
      return transaction.project.findUniqueOrThrow({
        include: projectInclude,
        where: { id: projectId },
      });
    });
    return result;
  }

  async archive(projectId: string, actor: ProjectActor) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "project.manage",
    );
    if (project.status === ProjectStatus.archived) return project;
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.project.update({
        data: {
          archivedFrom: project.status,
          status: ProjectStatus.archived,
          version: { increment: 1 },
        },
        where: { id: projectId },
      });
      await this.audit(
        transaction,
        actor,
        "project.archive",
        projectId,
        project.workspaceId,
      );
      return updated;
    });
  }

  async restore(projectId: string, actor: ProjectActor) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "project.manage",
    );
    if (
      project.status !== ProjectStatus.archived ||
      !project.archivedFrom ||
      !new Set<ProjectStatus>([ProjectStatus.ready, ProjectStatus.active]).has(
        project.archivedFrom,
      )
    )
      throw new ProjectServiceError("PROJECT_NOT_RESTORABLE", 409);
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.project.update({
        data: {
          archivedFrom: null,
          status: project.archivedFrom!,
          version: { increment: 1 },
        },
        where: { id: projectId },
      });
      await this.audit(
        transaction,
        actor,
        "project.restore",
        projectId,
        project.workspaceId,
      );
      return updated;
    });
  }

  async addCandidate(
    projectId: string,
    input: { displayName: string; officialWebsite?: string; country?: string },
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "project.manage",
    );
    if (
      project.status !== ProjectStatus.identifying &&
      project.status !== ProjectStatus.waiting_confirmation
    )
      throw new ProjectServiceError("PROJECT_STATE_CONFLICT", 409);
    const website = input.officialWebsite
      ? this.normalizeUrl(input.officialWebsite)
      : undefined;
    return this.database.$transaction(async (transaction) => {
      const candidate = await transaction.brandCandidate.create({
        data: {
          confidence: "1.0000",
          country: input.country?.toUpperCase(),
          displayName: input.displayName.trim(),
          id: uuidv7(),
          normalizedName: this.normalizeName(input.displayName),
          officialWebsite: website,
          projectId,
          source: CandidateSource.manual,
        },
      });
      await this.audit(
        transaction,
        actor,
        "project.candidate.create",
        candidate.id,
        project.workspaceId,
      );
      return candidate;
    });
  }

  async rejectCandidate(
    projectId: string,
    candidateId: string,
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "project.manage",
    );
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.brandCandidate.updateMany({
        data: { status: CandidateStatus.rejected, version: { increment: 1 } },
        where: { id: candidateId, projectId, status: CandidateStatus.pending },
      });
      if (result.count !== 1)
        throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
      await this.audit(
        transaction,
        actor,
        "project.candidate.reject",
        candidateId,
        project.workspaceId,
      );
      return { rejected: true as const };
    });
  }

  async createSource(
    projectId: string,
    input: { type: KnowledgeSourceType; url: string },
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "source.manage",
    );
    const normalizedUrl = this.normalizeUrl(input.url);
    if (!Object.values(KnowledgeSourceType).includes(input.type))
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    try {
      return await this.database.$transaction(async (transaction) => {
        const source = await transaction.knowledgeSource.create({
          data: {
            confirmedAt: new Date(),
            confirmedById: actor.userId,
            id: uuidv7(),
            normalizedUrl,
            originalUrl: input.url,
            projectId,
            status: KnowledgeSourceStatus.confirmed,
            type: input.type,
          },
        });
        await this.audit(
          transaction,
          actor,
          "source.create",
          source.id,
          project.workspaceId,
        );
        return source;
      });
    } catch (error) {
      if (this.isUniqueConflict(error))
        throw new ProjectServiceError("SOURCE_ALREADY_EXISTS", 409);
      throw error;
    }
  }

  async listSourceSnapshots(
    projectId: string,
    sourceId: string,
    actorId: string,
  ) {
    await this.get(projectId, actorId);
    const source = await this.database.knowledgeSource.findFirst({
      where: { id: sourceId, projectId },
    });
    if (!source) throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
    return this.database.contentSnapshot.findMany({
      orderBy: { fetchedAt: "desc" },
      take: 50,
      where: { sourceId },
    });
  }

  async updateSource(
    projectId: string,
    sourceId: string,
    input: {
      status: KnowledgeSourceStatus;
      type: KnowledgeSourceType;
      version: number;
    },
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "source.manage",
    );
    if (
      !Object.values(KnowledgeSourceType).includes(input.type) ||
      !Object.values(KnowledgeSourceStatus).includes(input.status)
    )
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.knowledgeSource.updateMany({
        data: {
          confirmedAt:
            input.status === KnowledgeSourceStatus.confirmed
              ? new Date()
              : undefined,
          confirmedById:
            input.status === KnowledgeSourceStatus.confirmed
              ? actor.userId
              : undefined,
          status: input.status,
          type: input.type,
          version: { increment: 1 },
        },
        where: { id: sourceId, projectId, version: input.version },
      });
      if (result.count !== 1)
        throw new ProjectServiceError("CONCURRENT_MODIFICATION", 409);
      await this.audit(
        transaction,
        actor,
        "source.update",
        sourceId,
        project.workspaceId,
      );
      return transaction.knowledgeSource.findUniqueOrThrow({
        where: { id: sourceId },
      });
    });
  }

  async disableSource(
    projectId: string,
    sourceId: string,
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "source.manage",
    );
    return this.database.$transaction(async (transaction) => {
      const result = await transaction.knowledgeSource.updateMany({
        data: {
          status: KnowledgeSourceStatus.rejected,
          version: { increment: 1 },
        },
        where: { id: sourceId, projectId },
      });
      if (result.count !== 1)
        throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
      await this.audit(
        transaction,
        actor,
        "source.disable",
        sourceId,
        project.workspaceId,
      );
      return { disabled: true as const };
    });
  }

  async queueSourceFetch(
    projectId: string,
    sourceId: string,
    idempotencyKey: string,
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "source.manage",
    );
    const source = await this.database.knowledgeSource.findFirst({
      where: { id: sourceId, projectId },
    });
    if (!source) throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
    if (source.status !== KnowledgeSourceStatus.confirmed)
      throw new ProjectServiceError("SOURCE_NOT_CONFIRMED", 409);
    const stableKey = `source-fetch/${sourceId}/${this.hash(idempotencyKey).slice(0, 32)}`;
    const existing = await this.database.sourceFetchJob.findUnique({
      where: { idempotencyKey: stableKey },
    });
    if (existing) return existing;
    const context = this.context();
    const jobId = uuidv7();
    try {
      return await this.database.$transaction(async (transaction) => {
        const job = await transaction.sourceFetchJob.create({
          data: { id: jobId, idempotencyKey: stableKey, sourceId },
        });
        await transaction.outboxEvent.create({
          data: {
            actorId: actor.userId,
            actorType: "user",
            aggregateId: sourceId,
            aggregateType: "KnowledgeSource",
            aggregateVersion: source.version,
            eventType: "source.fetch.requested",
            id: uuidv7(),
            idempotencyKey: `source.fetch.requested/${jobId}`,
            payload: { jobId, projectId, sourceId },
            traceId: context.traceId,
            workspaceId: project.workspaceId,
          },
        });
        await this.audit(
          transaction,
          actor,
          "source.fetch.queue",
          sourceId,
          project.workspaceId,
        );
        return job;
      });
    } catch (error) {
      if (this.isUniqueConflict(error))
        return this.database.sourceFetchJob.findUniqueOrThrow({
          where: { idempotencyKey: stableKey },
        });
      throw error;
    }
  }

  async completeSourceFetchEvent(eventId: string): Promise<boolean> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "source.fetch.requested") return false;
    const payload = event.payload as { jobId?: unknown; sourceId?: unknown };
    if (
      typeof payload.jobId !== "string" ||
      typeof payload.sourceId !== "string"
    )
      throw new ProjectServiceError("EVENT_PAYLOAD_INVALID", 400);
    const receipt = await this.database.inboxReceipt.findUnique({
      where: { consumer_eventId: { consumer: "source-fetch", eventId } },
    });
    if (receipt) return false;
    const job = await this.database.sourceFetchJob.findFirst({
      include: { source: true },
      where: { id: payload.jobId, sourceId: payload.sourceId },
    });
    if (!job || job.source.status !== KnowledgeSourceStatus.confirmed)
      throw new ProjectServiceError("SOURCE_NOT_CONFIRMED", 409);
    await this.database.sourceFetchJob.update({
      data: {
        attempts: { increment: 1 },
        errorCode: null,
        startedAt: new Date(),
        status: FetchJobStatus.running,
      },
      where: { id: job.id },
    });
    try {
      const result = await this.fetcher.fetch(job.source.normalizedUrl, {
        maxBytes: job.maxBytes,
        timeoutMs: job.timeoutMs,
      });
      return await this.database.$transaction(
        async (transaction) => {
          const processed = await transaction.inboxReceipt.findUnique({
            where: { consumer_eventId: { consumer: "source-fetch", eventId } },
          });
          if (processed) return false;
          const previous = await transaction.contentSnapshot.findFirst({
            orderBy: { fetchedAt: "desc" },
            where: { sourceId: job.sourceId },
          });
          await transaction.contentSnapshot.create({
            data: {
              contentHash: result.contentHash,
              diffSummary: previous
                ? { changed: previous.contentHash !== result.contentHash }
                : { changed: true, initial: true },
              extractedText: result.extractedText,
              fetchedAt: new Date(),
              finalUrl: result.finalUrl,
              httpStatus: result.httpStatus,
              id: uuidv7(),
              mimeType: result.mimeType,
              previousSnapshotId: previous?.id,
              sourceId: job.sourceId,
            },
          });
          await transaction.sourceFetchJob.update({
            data: { completedAt: new Date(), status: FetchJobStatus.succeeded },
            where: { id: job.id },
          });
          await transaction.knowledgeSource.update({
            data: {
              lastFetchedAt: new Date(),
              lastSuccessfulFetchedAt: new Date(),
              status: KnowledgeSourceStatus.confirmed,
              version: { increment: 1 },
            },
            where: { id: job.sourceId },
          });
          await transaction.inboxReceipt.create({
            data: { consumer: "source-fetch", eventId, id: uuidv7() },
          });
          return true;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const code =
        error instanceof SafeFetchError ? error.code : "FETCH_FAILED";
      await this.database.sourceFetchJob.update({
        data: { errorCode: code, status: FetchJobStatus.queued },
        where: { id: job.id },
      });
      throw error;
    }
  }

  async failSourceFetchEvent(
    eventId: string,
    errorCode: string,
  ): Promise<void> {
    const event = await this.database.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event || event.eventType !== "source.fetch.requested") return;
    const payload = event.payload as { jobId?: unknown; sourceId?: unknown };
    if (
      typeof payload.jobId !== "string" ||
      typeof payload.sourceId !== "string"
    )
      return;
    await this.database.$transaction([
      this.database.sourceFetchJob.updateMany({
        data: {
          completedAt: new Date(),
          errorCode,
          status: FetchJobStatus.failed,
        },
        where: { id: payload.jobId, sourceId: payload.sourceId },
      }),
      this.database.knowledgeSource.updateMany({
        data: {
          status: KnowledgeSourceStatus.unavailable,
          version: { increment: 1 },
        },
        where: { id: payload.sourceId },
      }),
    ]);
  }

  async confirm(
    projectId: string,
    input: ConfirmIdentificationInput,
    actor: ProjectActor,
  ) {
    const project = await this.get(projectId, actor.userId);
    await this.requirePermission(
      project.workspaceId,
      actor.userId,
      "project.manage",
    );
    if (project.status !== ProjectStatus.waiting_confirmation)
      throw new ProjectServiceError("PROJECT_STATE_CONFLICT", 409);
    return this.database.$transaction(
      async (transaction) => {
        await transaction.$queryRaw<
          Array<{ acquired: number }>
        >`SELECT 1 AS acquired WHERE pg_advisory_xact_lock(hashtext(${projectId})) IS NULL`;
        const candidate = await transaction.brandCandidate.findFirst({
          where: {
            id: input.candidateId,
            projectId,
            status: CandidateStatus.pending,
          },
        });
        if (!candidate)
          throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
        const canonicalName =
          input.canonicalName?.trim() || candidate.displayName;
        const website = input.officialWebsite
          ? this.normalizeUrl(input.officialWebsite)
          : candidate.officialWebsite;
        const brandId = uuidv7();
        const brand = await transaction.brandEntity.create({
          data: {
            canonicalName,
            country: input.country?.toUpperCase() ?? candidate.country,
            id: brandId,
            normalizedName: this.normalizeName(canonicalName),
            officialWebsite: website,
            primaryLanguage: input.primaryLanguage ?? project.defaultLanguage,
          },
        });
        const aliases = new Set(
          [candidate.displayName, ...(input.aliases ?? [])]
            .map((value) => value.trim())
            .filter(Boolean),
        );
        for (const value of aliases) {
          await transaction.brandAlias.create({
            data: {
              brandEntityId: brandId,
              id: uuidv7(),
              language: input.primaryLanguage ?? project.defaultLanguage,
              normalizedValue: this.normalizeName(value),
              source:
                value === candidate.displayName
                  ? candidate.source
                  : CandidateSource.manual,
              status: AliasStatus.confirmed,
              value,
            },
          });
        }
        await transaction.brandEntityVersion.create({
          data: {
            brandEntityId: brandId,
            canonicalName: brand.canonicalName,
            changeReason: "identification_confirmation",
            country: brand.country,
            createdById: actor.userId,
            id: uuidv7(),
            normalizedName: brand.normalizedName,
            officialWebsite: brand.officialWebsite,
            primaryLanguage: brand.primaryLanguage,
            versionNumber: 1,
          },
        });
        await transaction.brandCandidate.updateMany({
          data: { status: CandidateStatus.rejected, version: { increment: 1 } },
          where: { projectId, status: CandidateStatus.pending },
        });
        await transaction.brandCandidate.update({
          data: { status: CandidateStatus.confirmed },
          where: { id: candidate.id },
        });
        if (website) {
          await transaction.knowledgeSource.upsert({
            create: {
              confirmedAt: new Date(),
              confirmedById: actor.userId,
              id: uuidv7(),
              normalizedUrl: website,
              originalUrl: website,
              projectId,
              status: KnowledgeSourceStatus.confirmed,
              type: KnowledgeSourceType.official_website,
            },
            update: {
              confirmedAt: new Date(),
              confirmedById: actor.userId,
              status: KnowledgeSourceStatus.confirmed,
              type: KnowledgeSourceType.official_website,
              version: { increment: 1 },
            },
            where: {
              projectId_normalizedUrl: { normalizedUrl: website, projectId },
            },
          });
          await transaction.projectCapability.upsert({
            create: {
              code: "website",
              enabled: true,
              id: uuidv7(),
              projectId,
              source: "confirmed_website",
            },
            update: { enabled: true, source: "confirmed_website" },
            where: { projectId_code: { code: "website", projectId } },
          });
        }
        await transaction.project.update({
          data: {
            brandEntityId: brandId,
            onboardingStatus: OnboardingStatus.completed,
            status: ProjectStatus.ready,
            version: { increment: 1 },
          },
          where: { id: projectId },
        });
        await this.audit(
          transaction,
          actor,
          "project.identification.confirm",
          projectId,
          project.workspaceId,
        );
        return transaction.project.findUniqueOrThrow({
          include: projectInclude,
          where: { id: projectId },
        });
      },
      { isolationLevel: "Serializable" },
    );
  }

  async completeIdentificationEvent(eventId: string): Promise<boolean> {
    return this.database.$transaction(
      async (transaction) => {
        const receipt = await transaction.inboxReceipt.findUnique({
          where: {
            consumer_eventId: { consumer: "project-identification", eventId },
          },
        });
        if (receipt) return false;
        const event = await transaction.outboxEvent.findUniqueOrThrow({
          where: { id: eventId },
        });
        if (event.eventType !== "project.identification.requested")
          return false;
        const payload = event.payload as {
          jobId?: unknown;
          projectId?: unknown;
        };
        if (
          typeof payload.jobId !== "string" ||
          typeof payload.projectId !== "string"
        )
          throw new ProjectServiceError("EVENT_PAYLOAD_INVALID", 400);
        const job = await transaction.identificationJob.findFirst({
          where: { id: payload.jobId, projectId: payload.projectId },
        });
        if (!job) throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
        await transaction.identificationJob.update({
          data: {
            attempts: { increment: 1 },
            completedAt: new Date(),
            startedAt: job.startedAt ?? new Date(),
            status: FetchJobStatus.succeeded,
            version: { increment: 1 },
          },
          where: { id: job.id },
        });
        await transaction.project.updateMany({
          data: {
            onboardingStatus: OnboardingStatus.confirmation_required,
            status: ProjectStatus.waiting_confirmation,
            version: { increment: 1 },
          },
          where: { id: payload.projectId, status: ProjectStatus.identifying },
        });
        await transaction.inboxReceipt.create({
          data: { consumer: "project-identification", eventId, id: uuidv7() },
        });
        return true;
      },
      { isolationLevel: "Serializable" },
    );
  }

  async failIdentificationEvent(
    eventId: string,
    errorCode = "IDENTIFICATION_FAILED",
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const event = await transaction.outboxEvent.findUnique({
        where: { id: eventId },
      });
      if (!event || event.eventType !== "project.identification.requested")
        return;
      const payload = event.payload as {
        jobId?: unknown;
        projectId?: unknown;
      };
      if (
        typeof payload.jobId !== "string" ||
        typeof payload.projectId !== "string"
      )
        return;
      await transaction.identificationJob.updateMany({
        data: {
          attempts: { increment: 1 },
          completedAt: new Date(),
          errorCode,
          status: FetchJobStatus.failed,
          version: { increment: 1 },
        },
        where: { id: payload.jobId, projectId: payload.projectId },
      });
      await transaction.project.updateMany({
        data: {
          onboardingStatus: OnboardingStatus.failed,
          status: ProjectStatus.draft,
          version: { increment: 1 },
        },
        where: {
          id: payload.projectId,
          status: ProjectStatus.identifying,
        },
      });
    });
  }

  private normalizeCreateInput(input: CreateProjectInput) {
    const name = input.name.trim();
    if (!name || name.length > 120)
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    const defaultCountry = (input.defaultCountry ?? "CN").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(defaultCountry))
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    const defaultLanguage = (input.defaultLanguage ?? "zh-CN").trim();
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(defaultLanguage))
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    const timezone = input.timezone ?? "Asia/Shanghai";
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    }
    return {
      defaultCountry,
      defaultLanguage,
      industryId: input.industryId,
      name,
      timezone,
      websiteUrl: input.websiteUrl
        ? this.normalizeUrl(input.websiteUrl)
        : undefined,
      workspaceId: input.workspaceId,
    };
  }

  private async membership(workspaceId: string, userId: string) {
    const membership = await this.database.workspaceMembership.findFirst({
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
      },
      where: { status: MembershipStatus.active, userId, workspaceId },
    });
    if (!membership) throw new ProjectServiceError("RESOURCE_NOT_FOUND", 404);
    return membership;
  }

  private normalizeUrl(value: string): string {
    try {
      return normalizePublicUrl(value);
    } catch {
      throw new ProjectServiceError("VALIDATION_FAILED", 400);
    }
  }

  private async requirePermission(
    workspaceId: string,
    userId: string,
    code: string,
  ) {
    const membership = await this.membership(workspaceId, userId);
    if (
      !membership.role.rolePermissions.some(
        (item) => item.permission.code === code,
      )
    )
      throw new ProjectServiceError("FORBIDDEN", 403);
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    actor: ProjectActor,
    action: string,
    objectId: string,
    workspaceId: string,
  ) {
    const context = this.context();
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: this.maskEmail(actor.email),
        actorId: actor.userId,
        actorType: "user",
        id: uuidv7(),
        objectId,
        objectType: action.startsWith("source.")
          ? "KnowledgeSource"
          : action.includes("candidate")
            ? "BrandCandidate"
            : "Project",
        outcome: AuditOutcome.success,
        requestId: context.requestId,
        riskLevel: "low",
        traceId: context.traceId,
        workspaceId,
      },
    });
  }

  private context() {
    return (
      getRequestContext() ?? {
        requestId: `internal_${uuidv7()}`,
        traceId: createHash("sha256")
          .update(uuidv7())
          .digest("hex")
          .slice(0, 32),
      }
    );
  }

  private hash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
  private normalizeName(value: string): string {
    return value
      .trim()
      .normalize("NFKC")
      .toLocaleLowerCase("und")
      .replace(/\s+/g, " ");
  }
  private maskEmail(email: string): string {
    const [local = "", domain = ""] = email.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  }
  private isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
