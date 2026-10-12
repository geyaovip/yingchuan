import { createHash } from "node:crypto";

import {
  AuditOutcome,
  AuthAudience,
  ConfigStatus,
  MembershipStatus,
  ModelCallStatus,
  ProjectStatus,
  UsageEntryType,
  type ApiMode,
  type ModelFamily,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { getRequestContext } from "@yingchuan/observability";
import { v7 as uuidv7 } from "uuid";

import {
  ANALYSIS_OUTPUT_TOKEN_LIMIT,
  ModelGatewayError,
  type ModelGatewayRequest,
  type ModelGatewayResponse,
  type ModelProviderAdapter,
} from "./contracts.js";
import type { SecretBox } from "./secret-box.js";

export interface GatewayActor {
  readonly audience: AuthAudience;
  readonly email: string;
  readonly stepUpUntil?: Date | null;
  readonly userId: string;
}

export interface ModelVersionInput {
  readonly apiMode: ApiMode;
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly contextWindow?: number;
  readonly endpointId?: string;
  readonly inputPriceMicrosPerMillion?: bigint;
  readonly maxConcurrency?: number;
  readonly modelCode: string;
  readonly nativeWebSearch?: boolean;
  readonly outputPriceMicrosPerMillion?: bigint;
  readonly timeoutMs?: number;
  readonly webSearchConfig?: Readonly<Record<string, unknown>>;
}

export class ModelGatewayServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422,
  ) {
    super(code);
    this.name = "ModelGatewayServiceError";
  }
}

export interface AnalysisEstimate {
  readonly currency: string;
  readonly eligibleRunCount: number;
  readonly estimatedCostMicros: string;
  readonly inputTokenEstimate: number;
  readonly items: readonly {
    readonly estimatedCostMicros: string;
    readonly modelConfigId: string;
    readonly modelFamily: ModelFamily;
    readonly modelVersionId: string;
    readonly promptVersionId: string;
    readonly requiresWebSearch: boolean;
    readonly status: "eligible" | "unsupported";
  }[];
  readonly outputTokenEstimate: number;
  readonly skippedRunCount: number;
}

const modelInclude = {
  provider: true,
  versions: { orderBy: { versionNumber: "desc" as const }, take: 1 },
} satisfies Prisma.ModelConfigInclude;

export class ModelGatewayApplicationService {
  constructor(
    private readonly database: PrismaClient,
    private readonly secretBox: SecretBox,
    private readonly adapter: ModelProviderAdapter,
  ) {}

  async listForAdmin(actor: GatewayActor) {
    await this.requireAdmin(actor);
    const providers = await this.database.modelProvider.findMany({
      include: {
        credentials: {
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, keyVersion: true, maskedHint: true },
          take: 1,
          where: { retiredAt: null },
        },
        modelConfigs: {
          include: {
            versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          },
          orderBy: { modelFamily: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });
    return providers.map((provider) => ({
      ...provider,
      credential: provider.credentials[0] ?? null,
      credentialConfigured: provider.credentials.length > 0,
      credentials: undefined,
      modelConfigs: provider.modelConfigs.map((config) =>
        this.modelView(config),
      ),
    }));
  }

  async listCallsForAdmin(actor: GatewayActor, limit = 50) {
    await this.requireAdmin(actor);
    const calls = await this.database.modelCallLog.findMany({
      include: {
        modelConfigVersion: {
          include: {
            modelConfig: { select: { displayName: true, modelFamily: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
    });
    return calls.map((call) => ({
      ...call,
      costMicros: call.costMicros.toString(),
      modelConfigVersion: {
        ...call.modelConfigVersion,
        inputPriceMicrosPerMillion:
          call.modelConfigVersion.inputPriceMicrosPerMillion?.toString() ??
          null,
        outputPriceMicrosPerMillion:
          call.modelConfigVersion.outputPriceMicrosPerMillion?.toString() ??
          null,
      },
      webSearchCostMicros: call.webSearchCostMicros.toString(),
    }));
  }

  async overwriteCredential(
    providerId: string,
    credential: string,
    actor: GatewayActor,
  ) {
    await this.requireAdmin(actor, true);
    const encrypted = this.secretBox.encrypt(credential.trim());
    return this.database.$transaction(async (transaction) => {
      const provider = await transaction.modelProvider.findUnique({
        where: { id: providerId },
      });
      if (!provider)
        throw new ModelGatewayServiceError("RESOURCE_NOT_FOUND", 404);
      await transaction.modelProviderCredential.updateMany({
        data: { retiredAt: new Date() },
        where: { providerId, retiredAt: null },
      });
      await transaction.modelProviderCredential.create({
        data: { id: uuidv7(), providerId, ...encrypted },
      });
      await this.audit(
        transaction,
        actor,
        "model_provider.credential.overwrite",
        "ModelProvider",
        providerId,
        {
          credentialConfigured: true,
          maskedHint: encrypted.maskedHint,
        },
      );
      return { credentialConfigured: true, maskedHint: encrypted.maskedHint };
    });
  }

  async setProviderStatus(
    providerId: string,
    status: ConfigStatus,
    actor: GatewayActor,
  ) {
    await this.requireAdmin(actor);
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.modelProvider.findUnique({
        where: { id: providerId },
      });
      if (!existing)
        throw new ModelGatewayServiceError("RESOURCE_NOT_FOUND", 404);
      if (status === ConfigStatus.enabled) {
        const credential = await transaction.modelProviderCredential.findFirst({
          where: { providerId, retiredAt: null },
        });
        if (!credential)
          throw new ModelGatewayServiceError(
            "PROVIDER_CREDENTIAL_REQUIRED",
            409,
          );
      }
      const updated = await transaction.modelProvider.update({
        data: { status, version: { increment: 1 } },
        where: { id: providerId },
      });
      await this.audit(
        transaction,
        actor,
        "model_provider.status.update",
        "ModelProvider",
        providerId,
        { status },
      );
      return updated;
    });
  }

  async updateModelConfig(
    modelConfigId: string,
    input: ModelVersionInput & {
      displayName: string;
      isFallback?: boolean;
      status: ConfigStatus;
    },
    actor: GatewayActor,
  ) {
    await this.requireAdmin(actor);
    this.validateVersion(input);
    return this.database.$transaction(
      async (transaction) => {
        const existing = await transaction.modelConfig.findUnique({
          include: {
            provider: true,
            versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          },
          where: { id: modelConfigId },
        });
        if (!existing)
          throw new ModelGatewayServiceError("RESOURCE_NOT_FOUND", 404);
        if (
          input.status === ConfigStatus.enabled &&
          existing.provider.status !== ConfigStatus.enabled
        )
          throw new ModelGatewayServiceError("PROVIDER_DISABLED", 409);
        const versionNumber = (existing.versions[0]?.versionNumber ?? 0) + 1;
        await transaction.modelConfig.update({
          data: {
            displayName: input.displayName.trim(),
            isFallback: input.isFallback ?? false,
            status: input.status,
            version: { increment: 1 },
          },
          where: { id: modelConfigId },
        });
        const version = await transaction.modelConfigVersion.create({
          data: {
            apiMode: input.apiMode,
            capabilities: (input.capabilities ?? {}) as Prisma.InputJsonValue,
            contextWindow: input.contextWindow,
            endpointId: input.endpointId,
            id: uuidv7(),
            inputPriceMicrosPerMillion: input.inputPriceMicrosPerMillion,
            maxConcurrency: input.maxConcurrency ?? 1,
            modelCode: input.modelCode.trim(),
            modelConfigId,
            nativeWebSearch: input.nativeWebSearch ?? false,
            outputPriceMicrosPerMillion: input.outputPriceMicrosPerMillion,
            timeoutMs: input.timeoutMs ?? 60_000,
            versionNumber,
            webSearchConfig: input.webSearchConfig as
              Prisma.InputJsonValue | undefined,
          },
        });
        await this.audit(
          transaction,
          actor,
          "model_config.update",
          "ModelConfig",
          modelConfigId,
          {
            modelCode: version.modelCode,
            nativeWebSearch: version.nativeWebSearch,
            status: input.status,
            versionNumber,
          },
        );
        return this.modelView(
          await transaction.modelConfig.findUniqueOrThrow({
            include: modelInclude,
            where: { id: modelConfigId },
          }),
        );
      },
      { isolationLevel: "Serializable" },
    );
  }

  async probeModelConfig(modelConfigId: string, actor: GatewayActor) {
    await this.requireAdmin(actor);
    const config = await this.database.modelConfig.findUnique({
      include: {
        provider: true,
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
      where: { id: modelConfigId },
    });
    const version = config?.versions[0];
    if (!config || !version)
      throw new ModelGatewayServiceError("RESOURCE_NOT_FOUND", 404);

    const started = Date.now();
    try {
      const response = await this.invokeVersion(
        version.id,
        {
          maxOutputTokens: 16,
          prompt: "请只回复 OK。",
          requestId: `model_probe_${uuidv7()}`,
        },
        { allowDisabled: true },
      );
      const probedAt = new Date();
      await this.database.$transaction(async (transaction) => {
        await transaction.modelConfigVersion.update({
          data: { probedAt },
          where: { id: version.id },
        });
        await this.audit(
          transaction,
          actor,
          "model_config.probe",
          "ModelConfig",
          config.id,
          {
            latencyMs: Date.now() - started,
            modelCode: version.modelCode,
            status: "succeeded",
          },
        );
      });
      return {
        errorCode: null,
        inputTokens: response.inputTokens,
        latencyMs: Date.now() - started,
        modelCode: version.modelCode,
        outputTokens: response.outputTokens,
        probedAt: probedAt.toISOString(),
        providerRequestId: response.providerRequestId,
        status: "succeeded" as const,
      };
    } catch (error) {
      const errorCode =
        error instanceof ModelGatewayError ||
        error instanceof ModelGatewayServiceError
          ? error.code
          : "MODEL_PROBE_FAILED";
      await this.database.$transaction((transaction) =>
        this.audit(
          transaction,
          actor,
          "model_config.probe",
          "ModelConfig",
          config.id,
          {
            errorCode,
            latencyMs: Date.now() - started,
            modelCode: version.modelCode,
            status: "failed",
          },
          undefined,
          AuditOutcome.failure,
        ),
      );
      return {
        errorCode,
        inputTokens: 0,
        latencyMs: Date.now() - started,
        modelCode: version.modelCode,
        outputTokens: 0,
        probedAt: null,
        status: "failed" as const,
      };
    }
  }

  async estimate(
    projectId: string,
    actorId: string,
  ): Promise<AnalysisEstimate> {
    const project = await this.requireProjectPermission(
      projectId,
      actorId,
      "analysis.run",
    );
    if (
      project.status !== ProjectStatus.ready &&
      project.status !== ProjectStatus.active
    )
      throw new ModelGatewayServiceError("PROJECT_NOT_READY", 409);
    const prompts = await this.database.prompt.findMany({
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      where: { deletedAt: null, enabled: true, projectId },
    });
    const models = await this.database.modelConfig.findMany({
      include: modelInclude,
      where: {
        provider: { status: ConfigStatus.enabled },
        status: ConfigStatus.enabled,
      },
    });
    const items: AnalysisEstimate["items"][number][] = [];
    let totalCost = 0n;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const prompt of prompts) {
      const promptVersion = prompt.versions[0];
      if (!promptVersion) continue;
      for (const model of models) {
        const version = model.versions[0];
        if (!version) continue;
        const inputTokens = Math.max(
          1,
          Math.ceil(promptVersion.text.length / 2),
        );
        const outputTokens = ANALYSIS_OUTPUT_TOKEN_LIMIT;
        const unsupported =
          promptVersion.requiresWebSearch && !version.nativeWebSearch;
        const estimated = unsupported
          ? 0n
          : this.cost(version, inputTokens, outputTokens);
        items.push({
          estimatedCostMicros: estimated.toString(),
          modelConfigId: model.id,
          modelFamily: model.modelFamily,
          modelVersionId: version.id,
          promptVersionId: promptVersion.id,
          requiresWebSearch: promptVersion.requiresWebSearch,
          status: unsupported ? "unsupported" : "eligible",
        });
        if (!unsupported) {
          totalCost += estimated;
          totalInputTokens += inputTokens;
          totalOutputTokens += outputTokens;
        }
      }
    }
    return {
      currency: "CNY",
      eligibleRunCount: items.filter((item) => item.status === "eligible")
        .length,
      estimatedCostMicros: totalCost.toString(),
      inputTokenEstimate: totalInputTokens,
      items,
      outputTokenEstimate: totalOutputTokens,
      skippedRunCount: items.filter((item) => item.status === "unsupported")
        .length,
    };
  }

  async reserve(projectId: string, actorId: string, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new ModelGatewayServiceError("IDEMPOTENCY_KEY_REQUIRED", 400);
    const project = await this.requireProjectPermission(
      projectId,
      actorId,
      "analysis.run",
    );
    const estimate = await this.estimate(projectId, actorId);
    const amount = BigInt(estimate.estimatedCostMicros);
    return this.database.$transaction(
      async (transaction) => {
        const existing = await transaction.usageLedgerEntry.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          const metadata = existing.metadata as {
            estimateHash?: string;
          } | null;
          if (
            existing.projectId !== projectId ||
            metadata?.estimateHash !== this.hash(estimate)
          )
            throw new ModelGatewayServiceError("IDEMPOTENCY_CONFLICT", 409);
          return this.ledgerView(existing);
        }
        const aggregate = await transaction.usageLedgerEntry.aggregate({
          _sum: { quantityMicros: true },
          where: {
            resourceType: "model_cost",
            workspaceId: project.workspaceId,
          },
        });
        const balance = aggregate._sum.quantityMicros ?? 0n;
        if (balance < amount)
          throw new ModelGatewayServiceError("USAGE_QUOTA_EXCEEDED", 409);
        const entry = await transaction.usageLedgerEntry.create({
          data: {
            entryType: UsageEntryType.reservation,
            id: uuidv7(),
            idempotencyKey,
            metadata: {
              estimateHash: this.hash(estimate),
              runCount: estimate.eligibleRunCount,
            },
            projectId,
            quantityMicros: -amount,
            resourceType: "model_cost",
            source: "analysis_estimate",
            userId: actorId,
            workspaceId: project.workspaceId,
          },
        });
        await this.audit(
          transaction,
          { audience: AuthAudience.user, email: "", userId: actorId },
          "usage.reserve",
          "UsageLedgerEntry",
          entry.id,
          {
            amountMicros: amount.toString(),
            projectId,
          },
          project.workspaceId,
        );
        return this.ledgerView(entry);
      },
      { isolationLevel: "Serializable" },
    );
  }

  async usage(workspaceId: string, actorId: string) {
    await this.requireWorkspacePermission(workspaceId, actorId, "usage.view");
    const [entries, aggregate] = await Promise.all([
      this.database.usageLedgerEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        where: { workspaceId },
      }),
      this.database.usageLedgerEntry.aggregate({
        _sum: { quantityMicros: true },
        where: { resourceType: "model_cost", workspaceId },
      }),
    ]);
    return {
      balanceMicros: (aggregate._sum.quantityMicros ?? 0n).toString(),
      currency: "CNY",
      entries: entries.map((entry) => this.ledgerView(entry)),
    };
  }

  async invokeVersion(
    modelConfigVersionId: string,
    input: Omit<ModelGatewayRequest, "apiMode" | "modelCode" | "timeoutMs"> & {
      readonly projectId?: string;
      readonly workspaceId?: string;
    },
    options: { readonly allowDisabled?: boolean } = {},
  ): Promise<ModelGatewayResponse> {
    const version = await this.database.modelConfigVersion.findUnique({
      include: { modelConfig: { include: { provider: true } } },
      where: { id: modelConfigVersionId },
    });
    if (
      !version ||
      (!options.allowDisabled &&
        version.modelConfig.status !== ConfigStatus.enabled) ||
      version.modelConfig.provider.status !== ConfigStatus.enabled
    )
      throw new ModelGatewayServiceError("MODEL_UNAVAILABLE", 409);
    if (input.nativeWebSearch && !version.nativeWebSearch)
      throw new ModelGatewayServiceError("NATIVE_WEB_SEARCH_UNSUPPORTED", 422);
    const credential = await this.database.modelProviderCredential.findFirst({
      orderBy: { createdAt: "desc" },
      where: { providerId: version.modelConfig.providerId, retiredAt: null },
    });
    if (!credential)
      throw new ModelGatewayServiceError("PROVIDER_CREDENTIAL_REQUIRED", 409);
    const rawCredential = this.secretBox.decrypt(credential);
    const request: ModelGatewayRequest = {
      apiMode: version.apiMode,
      maxOutputTokens: input.maxOutputTokens,
      modelCode: version.modelCode,
      nativeWebSearch: input.nativeWebSearch,
      prompt: input.prompt,
      requestId: input.requestId,
      timeoutMs: version.timeoutMs,
    };
    const started = Date.now();
    let retries = 0;
    try {
      let response: ModelGatewayResponse;
      while (true) {
        try {
          response = await this.adapter.invoke(request, rawCredential);
          break;
        } catch (error) {
          if (
            !(error instanceof ModelGatewayError) ||
            !error.retryable ||
            retries >= 2
          )
            throw error;
          retries += 1;
        }
      }
      await this.database.modelCallLog.create({
        data: {
          costMicros: this.cost(
            version,
            response.inputTokens,
            response.outputTokens,
          ),
          id: uuidv7(),
          inputTokens: response.inputTokens,
          latencyMs: Date.now() - started,
          modelConfigVersionId,
          nativeWebSearchEnabled: Boolean(input.nativeWebSearch),
          outputTokens: response.outputTokens,
          projectId: input.projectId,
          providerId: version.modelConfig.providerId,
          providerRequestId: response.providerRequestId,
          requestHash: this.hash({ prompt: input.prompt }),
          requestId: input.requestId,
          responseHash: this.hash({ text: response.text }),
          retryCount: retries,
          status: ModelCallStatus.succeeded,
          webSearchToolVersion: input.nativeWebSearch?.toolVersion,
          workspaceId: input.workspaceId,
        },
      });
      return response;
    } catch (error) {
      const gatewayError =
        error instanceof ModelGatewayError
          ? error
          : new ModelGatewayError("unknown", "MODEL_CALL_FAILED", false);
      await this.database.modelCallLog.create({
        data: {
          errorCategory: gatewayError.category,
          errorCode: gatewayError.code,
          id: uuidv7(),
          latencyMs: Date.now() - started,
          modelConfigVersionId,
          nativeWebSearchEnabled: Boolean(input.nativeWebSearch),
          projectId: input.projectId,
          providerId: version.modelConfig.providerId,
          requestHash: this.hash({ prompt: input.prompt }),
          requestId: input.requestId,
          retryCount: retries,
          status: ModelCallStatus.failed,
          webSearchToolVersion: input.nativeWebSearch?.toolVersion,
          workspaceId: input.workspaceId,
        },
      });
      throw gatewayError;
    }
  }

  async invokeDefaultAgentModel(
    input: Omit<ModelGatewayRequest, "apiMode" | "modelCode" | "timeoutMs">,
  ): Promise<ModelGatewayResponse> {
    const config = await this.database.modelConfig.findFirst({
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
      orderBy: [{ isFallback: "desc" }, { createdAt: "asc" }],
      where: {
        provider: { status: ConfigStatus.enabled },
        status: ConfigStatus.enabled,
      },
    });
    const version = config?.versions[0];
    if (!version) throw new ModelGatewayServiceError("MODEL_UNAVAILABLE", 409);
    return this.invokeVersion(version.id, input);
  }

  async invokeBatch(
    inputs: readonly {
      readonly input: Omit<
        ModelGatewayRequest,
        "apiMode" | "modelCode" | "timeoutMs"
      > & {
        readonly projectId?: string;
        readonly workspaceId?: string;
      };
      readonly modelConfigVersionId: string;
    }[],
  ) {
    return Promise.all(
      inputs.map(async ({ input, modelConfigVersionId }) => {
        try {
          return {
            modelConfigVersionId,
            response: await this.invokeVersion(modelConfigVersionId, input),
            status: "succeeded" as const,
          };
        } catch (error) {
          const known = error instanceof ModelGatewayError;
          return {
            errorCategory: known ? error.category : "unknown",
            errorCode:
              error instanceof ModelGatewayError ||
              error instanceof ModelGatewayServiceError
                ? error.code
                : "MODEL_CALL_FAILED",
            modelConfigVersionId,
            status: "failed" as const,
          };
        }
      }),
    );
  }

  private cost(
    version: {
      inputPriceMicrosPerMillion: bigint | null;
      outputPriceMicrosPerMillion: bigint | null;
    },
    inputTokens: number,
    outputTokens: number,
  ): bigint {
    const input =
      (BigInt(inputTokens) * (version.inputPriceMicrosPerMillion ?? 0n) +
        999_999n) /
      1_000_000n;
    const output =
      (BigInt(outputTokens) * (version.outputPriceMicrosPerMillion ?? 0n) +
        999_999n) /
      1_000_000n;
    return input + output;
  }

  private validateVersion(input: ModelVersionInput): void {
    if (
      !input.modelCode.trim() ||
      (input.maxConcurrency ?? 1) < 1 ||
      (input.timeoutMs ?? 60_000) < 1_000
    )
      throw new ModelGatewayServiceError("VALIDATION_FAILED", 400);
    if (input.nativeWebSearch && !input.webSearchConfig)
      throw new ModelGatewayServiceError("WEB_SEARCH_CONFIG_REQUIRED", 400);
  }

  private async requireAdmin(
    actor: GatewayActor,
    stepUp = false,
  ): Promise<void> {
    if (actor.audience !== AuthAudience.admin)
      throw new ModelGatewayServiceError("FORBIDDEN", 403);
    const role = await this.database.platformRoleAssignment.findFirst({
      where: { role: { code: "super_admin" }, userId: actor.userId },
    });
    if (!role) throw new ModelGatewayServiceError("FORBIDDEN", 403);
    if (
      stepUp &&
      (!actor.stepUpUntil || actor.stepUpUntil.getTime() <= Date.now())
    )
      throw new ModelGatewayServiceError("AUTH_STEP_UP_REQUIRED", 403);
  }

  private async requireProjectPermission(
    projectId: string,
    actorId: string,
    permission: string,
  ) {
    const project = await this.database.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new ModelGatewayServiceError("RESOURCE_NOT_FOUND", 404);
    await this.requireWorkspacePermission(
      project.workspaceId,
      actorId,
      permission,
    );
    return project;
  }

  private async requireWorkspacePermission(
    workspaceId: string,
    actorId: string,
    permission: string,
  ) {
    const membership = await this.database.workspaceMembership.findFirst({
      where: {
        role: {
          rolePermissions: { some: { permission: { code: permission } } },
        },
        status: MembershipStatus.active,
        userId: actorId,
        workspaceId,
      },
    });
    if (!membership)
      throw new ModelGatewayServiceError("RESOURCE_NOT_FOUND", 404);
    return membership;
  }

  private ledgerView(entry: {
    createdAt: Date;
    currency: string;
    entryType: UsageEntryType;
    id: string;
    idempotencyKey: string;
    projectId: string | null;
    quantityMicros: bigint;
    resourceType: string;
    source: string;
  }) {
    return {
      createdAt: entry.createdAt.toISOString(),
      currency: entry.currency,
      entryType: entry.entryType,
      id: entry.id,
      idempotencyKey: entry.idempotencyKey,
      projectId: entry.projectId,
      quantityMicros: entry.quantityMicros.toString(),
      resourceType: entry.resourceType,
      source: entry.source,
    };
  }

  private modelView<
    T extends {
      versions: readonly {
        inputPriceMicrosPerMillion: bigint | null;
        outputPriceMicrosPerMillion: bigint | null;
      }[];
    },
  >(model: T) {
    return {
      ...model,
      versions: model.versions.map((version) => ({
        ...version,
        inputPriceMicrosPerMillion:
          version.inputPriceMicrosPerMillion?.toString() ?? null,
        outputPriceMicrosPerMillion:
          version.outputPriceMicrosPerMillion?.toString() ?? null,
      })),
    };
  }

  private hash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    actor: GatewayActor,
    action: string,
    objectType: string,
    objectId: string,
    afterSummary: Prisma.InputJsonValue,
    workspaceId?: string,
    outcome: AuditOutcome = AuditOutcome.success,
  ): Promise<void> {
    const context = getRequestContext() ?? {
      requestId: `internal_${uuidv7()}`,
      traceId: createHash("sha256").update(uuidv7()).digest("hex").slice(0, 32),
    };
    await transaction.auditLog.create({
      data: {
        action,
        actorEmailMask: this.maskEmail(actor.email),
        actorId: actor.userId,
        actorType: "user",
        afterSummary,
        id: uuidv7(),
        objectId,
        objectType,
        outcome,
        requestId: context.requestId,
        riskLevel: action.includes("credential") ? "high" : "medium",
        traceId: context.traceId,
        workspaceId,
      },
    });
  }

  private maskEmail(email: string): string | undefined {
    if (!email.includes("@")) return undefined;
    const [name, domain] = email.split("@");
    return `${name?.slice(0, 2) ?? ""}***@${domain}`;
  }
}
