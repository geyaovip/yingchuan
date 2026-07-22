import type { paths as GeneratedPaths } from "./generated/openapi.js";

export type GeneratedApiPath = keyof GeneratedPaths;

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: ApiErrorBody,
  ) {
    super(detail.message);
    this.name = "ApiError";
  }
}

export interface SessionView {
  readonly audience: "user" | "admin";
  readonly csrfToken: string;
  readonly email: string;
  readonly expiresAt: string;
  readonly stepUpUntil?: string;
  readonly userId: string;
}

export interface WorkspaceView {
  readonly id: string;
  readonly name: string;
  readonly roleCode: string;
  readonly slug: string;
  readonly version: number;
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly getDeviceId?: () => string;
}

interface Envelope<T> {
  readonly data: T;
}

const mutations = new Set(["DELETE", "PATCH", "POST", "PUT"]);

export class ApiClient {
  private readonly cache = new Map<string, unknown>();
  private csrfToken?: string;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly getDeviceId: () => string;
  private workspaceId?: string;
  private workspaceVersion = 0;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImplementation =
      options.fetch ?? globalThis.fetch.bind(globalThis);
    this.getDeviceId = options.getDeviceId ?? createBrowserDeviceId;
  }

  selectWorkspace(workspaceId: string | undefined): void {
    if (workspaceId === this.workspaceId) return;
    this.workspaceId = workspaceId;
    this.workspaceVersion += 1;
    this.cache.clear();
  }

  setSession(session: SessionView | undefined): void {
    this.csrfToken = session?.csrfToken;
    if (!session) this.selectWorkspace(undefined);
  }

  async getSession(): Promise<SessionView> {
    const session = await this.request<SessionView>("/auth/session");
    this.setSession(session);
    return session;
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    options: { readonly cache?: boolean } = {},
  ): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const cacheKey = `${this.workspaceId ?? "global"}:${method}:${path}`;
    if (method === "GET" && options.cache && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }

    const selectedWorkspaceVersion = this.workspaceVersion;
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("x-device-id", this.getDeviceId());
    headers.set("x-request-id", createRequestId());
    if (this.workspaceId) headers.set("x-workspace-id", this.workspaceId);
    if (mutations.has(method) && this.csrfToken) {
      headers.set("x-csrf-token", this.csrfToken);
    }
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await this.fetchImplementation(
      `${normalizeApiOrigin(this.options.baseUrl)}/api/v1${path}`,
      { ...init, credentials: "include", headers, method },
    );
    const body = await readBody(response);
    if (!response.ok) throw toApiError(response.status, body);
    if (selectedWorkspaceVersion !== this.workspaceVersion) {
      throw new ApiError(409, {
        code: "WORKSPACE_CONTEXT_CHANGED",
        message: "工作区已切换，请重试当前操作。",
      });
    }
    const data = (body as Envelope<T>).data;
    if (method === "GET" && options.cache) this.cache.set(cacheKey, data);
    if (mutations.has(method)) this.cache.clear();
    return data;
  }
}

function normalizeApiOrigin(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "").replace(/\/api\/v1$/, "");
}

function createRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
}

function createBrowserDeviceId(): string {
  const storageKey = "yingchuan.device-id";
  try {
    const current = globalThis.localStorage?.getItem(storageKey);
    if (current) return current;
    const created = `device_${createRequestId().replaceAll("-", "")}`;
    globalThis.localStorage?.setItem(storageKey, created);
    return created;
  } catch {
    return `device_${createRequestId().replaceAll("-", "")}`;
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return { data: undefined };
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  return response.json() as Promise<unknown>;
}

function toApiError(status: number, body: unknown): ApiError {
  const fallback: ApiErrorBody = {
    code: status >= 500 ? "SERVICE_UNAVAILABLE" : "REQUEST_FAILED",
    message: status >= 500 ? "服务暂时不可用，请稍后重试。" : "请求未能完成。",
  };
  if (!body || typeof body !== "object" || !("error" in body)) {
    return new ApiError(status, fallback);
  }
  const error = body.error;
  if (!error || typeof error !== "object")
    return new ApiError(status, fallback);
  const detail = error as Record<string, unknown>;
  return new ApiError(status, {
    code: typeof detail.code === "string" ? detail.code : fallback.code,
    message:
      typeof detail.message === "string" ? detail.message : fallback.message,
    requestId:
      typeof detail.requestId === "string" ? detail.requestId : undefined,
  });
}
