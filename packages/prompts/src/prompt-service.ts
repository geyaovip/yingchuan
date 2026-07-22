import { createHash } from "node:crypto";

import {
  AuditOutcome,
  MembershipStatus,
  ProjectStatus,
  PromptCategory,
  PromptScope,
  PromptSource,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import {
  normalizePromptText,
  promptSimilarity,
  PromptQualityError,
  type ScopeContext,
  validatePromptText,
  validateScope,
} from "./prompt-quality.js";

export interface PromptActor {
  readonly email: string;
  readonly userId: string;
}

export interface PromptInput extends ScopeContext {
  readonly category: PromptCategory;
  readonly enabled?: boolean;
  readonly groupKey?: string;
  readonly language?: string;
  readonly priority?: number;
  readonly requiresWebSearch?: boolean;
  readonly scope: PromptScope;
  readonly text: string;
}

export class PromptServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly similarPromptId?: string,
  ) {
    super(code);
    this.name = "PromptServiceError";
  }
}

const promptInclude = {
  versions: { orderBy: { versionNumber: "desc" as const }, take: 1 },
} satisfies Prisma.PromptInclude;

export class PromptApplicationService {
  constructor(private readonly database: PrismaClient) {}

  async list(projectId: string, actorId: string) {
    await this.project(projectId, actorId);
    return this.database.prompt.findMany({
      include: promptInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      where: { deletedAt: null, projectId },
    });
  }

  async history(projectId: string, promptId: string, actorId: string) {
    await this.project(projectId, actorId);
    const prompt = await this.database.prompt.findFirst({
      where: { id: promptId, projectId },
    });
    if (!prompt) throw new PromptServiceError("RESOURCE_NOT_FOUND", 404);
    return this.database.promptVersion.findMany({
      orderBy: { versionNumber: "desc" },
      where: { promptId },
    });
  }

  async create(
    projectId: string,
    input: PromptInput,
    actor: PromptActor,
    source: PromptSource = PromptSource.manual,
  ) {
    const project = await this.editableProject(projectId, actor.userId);
    const prepared = await this.prepare(projectId, input);
    try {
      return await this.database.$transaction(async (transaction) => {
        const id = uuidv7();
        const prompt = await transaction.prompt.create({
          data: {
            ...prepared,
            createdById: actor.userId,
            id,
            projectId,
            source,
          },
        });
        await transaction.promptVersion.create({
          data: {
            ...this.versionData(prompt),
            changeReason: "created",
            createdById: actor.userId,
            id: uuidv7(),
            promptId: id,
            versionNumber: 1,
          },
        });
        await this.audit(
          transaction,
          actor,
          "prompt.create",
          id,
          project.workspaceId,
        );
        return transaction.prompt.findUniqueOrThrow({
          include: promptInclude,
          where: { id },
        });
      });
    } catch (error) {
      if (this.uniqueConflict(error))
        throw new PromptServiceError("PROMPT_DUPLICATE", 409);
      throw error;
    }
  }

  async update(
    projectId: string,
    promptId: string,
    input: PromptInput & { version: number },
    actor: PromptActor,
  ) {
    const project = await this.editableProject(projectId, actor.userId);
    const existing = await this.database.prompt.findFirst({
      where: { deletedAt: null, id: promptId, projectId },
    });
    if (!existing) throw new PromptServiceError("RESOURCE_NOT_FOUND", 404);
    const prepared = await this.prepare(projectId, input, promptId);
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const updated = await transaction.prompt.updateMany({
            data: { ...prepared, version: { increment: 1 } },
            where: { id: promptId, version: input.version },
          });
          if (updated.count !== 1)
            throw new PromptServiceError("CONCURRENT_MODIFICATION", 409);
          const current = await transaction.prompt.findUniqueOrThrow({
            where: { id: promptId },
          });
          await transaction.promptVersion.create({
            data: {
              ...this.versionData(current),
              changeReason: "edited",
              createdById: actor.userId,
              id: uuidv7(),
              promptId,
              versionNumber: current.version,
            },
          });
          await this.audit(
            transaction,
            actor,
            "prompt.update",
            promptId,
            project.workspaceId,
          );
          return transaction.prompt.findUniqueOrThrow({
            include: promptInclude,
            where: { id: promptId },
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (this.uniqueConflict(error))
        throw new PromptServiceError("PROMPT_DUPLICATE", 409);
      throw error;
    }
  }

  async remove(projectId: string, promptId: string, actor: PromptActor) {
    const project = await this.editableProject(projectId, actor.userId);
    return this.database.$transaction(async (transaction) => {
      const prompt = await transaction.prompt.findFirst({
        where: { deletedAt: null, id: promptId, projectId },
      });
      if (!prompt) throw new PromptServiceError("RESOURCE_NOT_FOUND", 404);
      await transaction.prompt.update({
        data: {
          deletedAt: new Date(),
          enabled: false,
          normalizedText: `${prompt.normalizedText}#deleted:${prompt.id}`,
          version: { increment: 1 },
        },
        where: { id: promptId },
      });
      await this.audit(
        transaction,
        actor,
        "prompt.delete",
        promptId,
        project.workspaceId,
      );
      return { deleted: true as const };
    });
  }

  async importMany(
    projectId: string,
    inputs: readonly PromptInput[],
    actor: PromptActor,
  ) {
    if (inputs.length === 0 || inputs.length > 100)
      throw new PromptServiceError("VALIDATION_FAILED", 400);
    const prompts = [];
    for (const input of inputs)
      prompts.push(
        await this.create(projectId, input, actor, PromptSource.imported),
      );
    return prompts;
  }

  async generate(
    projectId: string,
    input: ScopeContext & {
      count?: number;
      groupKey?: string;
      scope?: PromptScope;
    },
    actor: PromptActor,
  ) {
    const project = await this.editableProject(projectId, actor.userId);
    if (!project.brandEntity)
      throw new PromptServiceError("PROJECT_NOT_READY", 409);
    const count = Math.min(Math.max(input.count ?? 6, 1), 12);
    const scope = input.scope ?? PromptScope.global;
    const context = {
      city: input.city,
      country: input.country ?? project.defaultCountry,
      district: input.district,
      nearbyLandmark: input.nearbyLandmark,
      province: input.province,
      targetStoreId: input.targetStoreId,
    };
    this.quality(() => validateScope(scope, context));
    const brand = project.brandEntity.canonicalName;
    const industry = project.industry?.name ?? "相关产品或服务";
    const place = context.city ?? context.province ?? context.country ?? "本地";
    const candidates: Array<[PromptCategory, string]> = [
      [
        PromptCategory.brand_awareness,
        `提到${industry}时，人们通常会想到哪些品牌？`,
      ],
      [
        PromptCategory.recommendation,
        `${place}有哪些值得了解的${industry}品牌？`,
      ],
      [PromptCategory.trust, `选择${brand}前，应该关注哪些口碑和可信度信息？`],
      [PromptCategory.comparison, `${brand}与同类品牌相比有哪些特点？`],
      [PromptCategory.factual, `${brand}主要提供哪些产品或服务？`],
      [PromptCategory.alternative, `如果不选择${brand}，还有哪些同类方案？`],
      [PromptCategory.scenario, `哪些${industry}品牌适合重视服务体验的用户？`],
      [PromptCategory.price, `${industry}常见的价格区间和选择标准是什么？`],
      [PromptCategory.location, `${place}有哪些容易找到的${industry}品牌？`],
      [
        PromptCategory.product_or_service,
        `如何比较不同${industry}品牌的核心产品？`,
      ],
      [
        PromptCategory.trust,
        `判断一个${industry}品牌是否可靠，应查看哪些信息？`,
      ],
      [PromptCategory.comparison, `不同${industry}品牌各自适合哪些需求？`],
    ];
    const created = [];
    for (const [category, text] of candidates) {
      if (created.length >= count) break;
      try {
        created.push(
          await this.create(
            projectId,
            {
              ...context,
              category,
              groupKey:
                input.groupKey ??
                `generated-${new Date().toISOString().slice(0, 10)}`,
              language: project.defaultLanguage,
              priority: 50,
              scope,
              text,
            },
            actor,
            PromptSource.generated,
          ),
        );
      } catch (error) {
        if (
          error instanceof PromptServiceError &&
          new Set(["PROMPT_DUPLICATE", "PROMPT_SIMILAR"]).has(error.code)
        )
          continue;
        throw error;
      }
    }
    return { generated: created, requested: count };
  }

  async variants(
    projectId: string,
    promptId: string,
    count: number,
    actor: PromptActor,
  ) {
    const base = await this.database.prompt.findFirst({
      where: { deletedAt: null, id: promptId, projectId },
    });
    if (!base) throw new PromptServiceError("RESOURCE_NOT_FOUND", 404);
    const amount = Math.min(Math.max(count, 1), 5);
    const stems = [
      `从普通用户角度看，${base.text.replace(/[?？]$/u, "")}？`,
      `如果更看重实际体验，${base.text.replace(/[?？]$/u, "")}？`,
      `在做决定之前，${base.text.replace(/[?？]$/u, "")}？`,
      `对于第一次了解的人，${base.text.replace(/[?？]$/u, "")}？`,
      `综合公开信息，${base.text.replace(/[?？]$/u, "")}？`,
    ];
    const result = [];
    for (const text of stems.slice(0, amount))
      result.push(
        await this.create(
          projectId,
          {
            category: base.category,
            city: base.city ?? undefined,
            country: base.country ?? undefined,
            district: base.district ?? undefined,
            enabled: base.enabled,
            groupKey: base.groupKey ?? `variant-${base.id}`,
            language: base.language,
            nearbyLandmark: base.nearbyLandmark ?? undefined,
            priority: base.priority,
            province: base.province ?? undefined,
            requiresWebSearch: base.requiresWebSearch,
            scope: base.scope,
            targetStoreId: base.targetStoreId ?? undefined,
            text,
          },
          actor,
          PromptSource.variant,
        ),
      );
    return result;
  }

  private async prepare(
    projectId: string,
    input: PromptInput,
    excludeId?: string,
  ) {
    const text = this.quality(() => validatePromptText(input.text));
    this.quality(() => validateScope(input.scope, input));
    if (!Object.values(PromptCategory).includes(input.category))
      throw new PromptServiceError("VALIDATION_FAILED", 400);
    const language = input.language?.trim() || "zh-CN";
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language))
      throw new PromptServiceError("VALIDATION_FAILED", 400);
    const priority = input.priority ?? 50;
    if (!Number.isInteger(priority) || priority < 0 || priority > 100)
      throw new PromptServiceError("VALIDATION_FAILED", 400);
    const normalizedText = normalizePromptText(text);
    const existing = await this.database.prompt.findMany({
      select: { id: true, normalizedText: true, text: true },
      where: {
        deletedAt: null,
        id: excludeId ? { not: excludeId } : undefined,
        projectId,
      },
    });
    const exact = existing.find(
      (item) => item.normalizedText === normalizedText,
    );
    if (exact) throw new PromptServiceError("PROMPT_DUPLICATE", 409, exact.id);
    const similar = existing.find(
      (item) => promptSimilarity(item.text, text) >= 0.82,
    );
    if (similar)
      throw new PromptServiceError("PROMPT_SIMILAR", 409, similar.id);
    return {
      category: input.category,
      city: input.city?.trim(),
      country: input.country?.trim().toUpperCase(),
      district: input.district?.trim(),
      enabled: input.enabled ?? true,
      groupKey: input.groupKey?.trim() || undefined,
      language,
      nearbyLandmark: input.nearbyLandmark?.trim(),
      normalizedText,
      priority,
      province: input.province?.trim(),
      requiresWebSearch: input.requiresWebSearch ?? false,
      scope: input.scope,
      targetStoreId: input.targetStoreId,
      text,
    };
  }

  private async editableProject(projectId: string, actorId: string) {
    const project = await this.project(projectId, actorId);
    if (
      project.status !== ProjectStatus.ready &&
      project.status !== ProjectStatus.active
    )
      throw new PromptServiceError("PROJECT_NOT_READY", 409);
    const allowed = project.workspace.memberships[0]?.role.rolePermissions.some(
      (item) => item.permission.code === "project.manage",
    );
    if (!allowed) throw new PromptServiceError("FORBIDDEN", 403);
    return project;
  }

  private async project(projectId: string, actorId: string) {
    const project = await this.database.project.findFirst({
      include: {
        brandEntity: true,
        industry: true,
        workspace: {
          include: {
            memberships: {
              include: {
                role: {
                  include: {
                    rolePermissions: { include: { permission: true } },
                  },
                },
              },
              where: { status: MembershipStatus.active, userId: actorId },
            },
          },
        },
      },
      where: { id: projectId },
    });
    if (!project || project.workspace.memberships.length === 0)
      throw new PromptServiceError("RESOURCE_NOT_FOUND", 404);
    return project;
  }

  private versionData(prompt: {
    category: PromptCategory;
    city: string | null;
    country: string | null;
    district: string | null;
    enabled: boolean;
    groupKey: string | null;
    language: string;
    nearbyLandmark: string | null;
    normalizedText: string;
    priority: number;
    province: string | null;
    requiresWebSearch: boolean;
    scope: PromptScope;
    source: PromptSource;
    targetStoreId: string | null;
    text: string;
  }) {
    return {
      category: prompt.category,
      city: prompt.city,
      country: prompt.country,
      district: prompt.district,
      enabled: prompt.enabled,
      groupKey: prompt.groupKey,
      language: prompt.language,
      nearbyLandmark: prompt.nearbyLandmark,
      normalizedText: prompt.normalizedText,
      priority: prompt.priority,
      province: prompt.province,
      requiresWebSearch: prompt.requiresWebSearch,
      scope: prompt.scope,
      source: prompt.source,
      targetStoreId: prompt.targetStoreId,
      text: prompt.text,
    };
  }

  private quality<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof PromptQualityError)
        throw new PromptServiceError(error.code, 400);
      throw error;
    }
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    actor: PromptActor,
    action: string,
    objectId: string,
    workspaceId: string,
  ) {
    const context = getRequestContext() ?? {
      requestId: `internal_${uuidv7()}`,
      traceId: createHash("sha256").update(uuidv7()).digest("hex").slice(0, 32),
    };
    const [local = "", domain = ""] = actor.email.split("@");
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: `${local.slice(0, 2)}***@${domain}`,
        actorId: actor.userId,
        actorType: "user",
        id: uuidv7(),
        objectId,
        objectType: "Prompt",
        outcome: AuditOutcome.success,
        requestId: context.requestId,
        riskLevel: "low",
        traceId: context.traceId,
        workspaceId,
      },
    });
  }

  private uniqueConflict(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
