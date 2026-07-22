import { ApiError, type SessionView } from "@yingchuan/api-client";
import {
  AppShell,
  Button,
  FormField,
  LoginPanel,
  PageHeader,
  ResponsiveData,
  Skeleton,
  StatePanel,
  StatusBadge,
  type NavigationItem,
  type ResponsiveColumn,
} from "@yingchuan/ui";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { api } from "./api";

interface AuditRow {
  readonly action: string;
  readonly actorEmailMask?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly objectType: string;
  readonly outcome: "success" | "failure";
  readonly requestId: string;
  readonly riskLevel: string;
}

interface ModelVersion {
  readonly apiMode: "responses" | "chat_completions";
  readonly inputPriceMicrosPerMillion: string | null;
  readonly maxConcurrency: number;
  readonly modelCode: string;
  readonly nativeWebSearch: boolean;
  readonly outputPriceMicrosPerMillion: string | null;
  readonly timeoutMs: number;
}

interface ModelConfig {
  readonly displayName: string;
  readonly id: string;
  readonly isFallback: boolean;
  readonly modelFamily: string;
  readonly status: "enabled" | "disabled";
  readonly versions: readonly ModelVersion[];
}

interface ModelProvider {
  readonly code: string;
  readonly credential?: { readonly maskedHint: string };
  readonly credentialConfigured: boolean;
  readonly id: string;
  readonly modelConfigs: readonly ModelConfig[];
  readonly name: string;
  readonly status: "enabled" | "disabled";
}
interface ModelCallResponse {
  readonly costMicros: string;
  readonly createdAt: string;
  readonly errorCode?: string;
  readonly id: string;
  readonly inputTokens: number;
  readonly latencyMs: number;
  readonly outputTokens: number;
  readonly status: string;
}

interface AdminDashboardResponse {
  readonly dataFrom: string;
  readonly dataTo: string;
  readonly failedCalls: number;
  readonly failedJobs: number;
  readonly jobs: number;
  readonly modelCalls: number;
  readonly pendingOutbox: number;
  readonly projects: number;
  readonly users: number;
  readonly workspaces: number;
}
interface AdminUserResponse {
  readonly createdAt: string;
  readonly displayEmail: string;
  readonly id: string;
  readonly memberships: readonly {
    readonly role: { readonly code: string };
    readonly workspace: {
      readonly id: string;
      readonly name: string;
      readonly _count: { readonly projects: number };
      readonly usageLedgerEntries: readonly {
        readonly quantityMicros: string;
      }[];
    };
  }[];
  readonly status: string;
}
interface AdminProjectResponse {
  readonly brandEntity?: { readonly canonicalName: string };
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly workspace: { readonly name: string };
  readonly analysisJobs: readonly { readonly status: string }[];
}
interface AdminTaskResponse {
  readonly createdAt: string;
  readonly failedRuns: number;
  readonly id: string;
  readonly project: { readonly name: string };
  readonly status: string;
  readonly succeededRuns: number;
  readonly totalRuns: number;
}
interface AgentRunResponse {
  readonly actions: readonly {
    readonly id: string;
    readonly skillName: string;
    readonly status: string;
  }[];
  readonly answer?: string;
  readonly citations: readonly {
    readonly citation: string;
    readonly skill: string;
  }[];
  readonly costMicros: string;
  readonly createdAt: string;
  readonly errorCode?: string;
  readonly id: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly runtimeVersion: string;
  readonly status: string;
}
interface TelegramConfigResponse {
  readonly chatIdHint?: string;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly lastErrorCode?: string;
  readonly lastSuccessAt?: string;
  readonly lastTestedAt?: string;
  readonly tokenHint?: string;
}
interface NotificationDeliveryResponse {
  readonly attempts: number;
  readonly createdAt: string;
  readonly errorCode?: string;
  readonly id: string;
  readonly status: string;
}

const navigation: readonly NavigationItem[] = [
  { href: "/admin", label: "管理首页", marker: "⌂" },
  { href: "/admin/users", label: "用户与工作区", marker: "◎" },
  { href: "/admin/projects", label: "项目", marker: "◇" },
  { href: "/admin/tasks", label: "任务", marker: "↻" },
  { href: "/admin/models", label: "模型", marker: "✦" },
  { href: "/admin/agent", label: "Agent", marker: "·" },
  { href: "/admin/notification-channels", label: "通知渠道", marker: "○" },
  { href: "/admin/usage", label: "用量", marker: "↗" },
  { href: "/admin/audit-logs", label: "审计日志", marker: "≡" },
];

export function App() {
  const [session, setSession] = useState<SessionView>();
  const [loading, setLoading] = useState(true);
  const previewSession =
    import.meta.env.DEV &&
    new URLSearchParams(globalThis.location.search).get("preview") === "shell"
      ? ({
          audience: "admin",
          csrfToken: "development-preview",
          email: "geyaovip@163.com",
          expiresAt: "2099-01-01T00:00:00.000Z",
          userId: "development-preview",
        } satisfies SessionView)
      : undefined;
  useEffect(() => {
    void api
      .getSession()
      .then((next) => setSession(next.audience === "admin" ? next : undefined))
      .catch(() => setSession(undefined))
      .finally(() => setLoading(false));
  }, []);
  if (previewSession) return <AdminShell session={previewSession} />;
  if (loading)
    return (
      <main className="yc-auth-page">
        <section className="yc-auth-card">
          <Skeleton lines={4} />
        </section>
      </main>
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate replace to="/admin" />
          ) : (
            <AdminLogin onLogin={setSession} />
          )
        }
      />
      <Route
        path="/*"
        element={
          session ? (
            <AdminShell session={session} />
          ) : (
            <Navigate replace to="/login" />
          )
        }
      />
    </Routes>
  );
}

function AdminLogin({
  onLogin,
}: {
  readonly onLogin: (session: SessionView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const perform = async (operation: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
      return true;
    } catch (caught) {
      setError(messageFor(caught));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <LoginPanel
      audience="admin"
      busy={busy}
      error={error}
      onRequestCode={(email) =>
        perform(async () => {
          await api.request("/auth/email-code-requests", {
            body: JSON.stringify({ audience: "admin", email }),
            method: "POST",
          });
        })
      }
      onVerifyCode={async (email, code) => {
        await perform(async () => {
          const next = await api.request<SessionView>(
            "/auth/email-code-verifications",
            {
              body: JSON.stringify({ audience: "admin", code, email }),
              method: "POST",
            },
          );
          api.setSession(next);
          onLogin(next);
        });
      }}
    />
  );
}

function AdminShell({ session }: { readonly session: SessionView }) {
  const location = useLocation();
  return (
    <AppShell
      activeHref={location.pathname}
      brand="映川管理端"
      navigation={navigation}
      userEmail={session.email}
    >
      <Routes>
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/projects" element={<AdminProjects />} />
        <Route path="/admin/tasks" element={<AdminTasks />} />
        <Route path="/admin/agent" element={<AdminAgent />} />
        <Route
          path="/admin/notification-channels"
          element={<TelegramSettings />}
        />
        <Route path="/admin/models" element={<ModelManagement />} />
        <Route path="/admin/audit-logs" element={<AuditLogs />} />
        <Route
          path="*"
          element={<AdminPlaceholder path={location.pathname} />}
        />
      </Routes>
    </AppShell>
  );
}

function ModelManagement() {
  const [providers, setProviders] = useState<readonly ModelProvider[]>();
  const [calls, setCalls] = useState<readonly ModelCallResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [credential, setCredential] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      const result = await api.request<readonly ModelProvider[]>(
        "/admin/model-providers",
      );
      setProviders(result);
      setCalls(
        await api.request<readonly ModelCallResponse[]>(
          "/admin/model-calls?limit=30",
        ),
      );
      setSelectedId((current) => current ?? result[0]?.modelConfigs[0]?.id);
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  useEffect(() => {
    let active = true;
    void api
      .request<readonly ModelProvider[]>("/admin/model-providers")
      .then((result) => {
        if (!active) return;
        setProviders(result);
        setSelectedId(result[0]?.modelConfigs[0]?.id);
        void api
          .request<readonly ModelCallResponse[]>("/admin/model-calls?limit=30")
          .then(setCalls);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFor(caught));
      });
    return () => {
      active = false;
    };
  }, []);
  const execute = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  if (!providers && !error) return <Skeleton lines={7} />;
  const provider = providers?.[0];
  const selected = provider?.modelConfigs.find(
    (item) => item.id === selectedId,
  );
  const version = selected?.versions[0];
  return (
    <>
      <PageHeader
        description="P0 统一通过火山方舟调用，四个模型族各自版本化配置。"
        eyebrow="MODEL GATEWAY"
        title="模型管理"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      {provider && (
        <div className="yc-content-grid">
          <section>
            <section className="yc-card yc-section-card">
              <h2>{provider.name}</h2>
              <p>
                Provider <code>{provider.code}</code> · 凭证
                {provider.credentialConfigured
                  ? `已配置（${provider.credential?.maskedHint ?? "已加密"}）`
                  : "未配置"}
              </p>
              <div className="yc-actions">
                <StatusBadge
                  tone={provider.status === "enabled" ? "success" : "neutral"}
                >
                  {provider.status === "enabled" ? "已启用" : "已停用"}
                </StatusBadge>
                <Button
                  disabled={
                    busy ||
                    (!provider.credentialConfigured &&
                      provider.status === "disabled")
                  }
                  onClick={() =>
                    void execute(() =>
                      api.request(
                        `/admin/model-providers/${provider.id}/status`,
                        {
                          body: JSON.stringify({
                            status:
                              provider.status === "enabled"
                                ? "disabled"
                                : "enabled",
                          }),
                          method: "PATCH",
                        },
                      ),
                    )
                  }
                >
                  {provider.status === "enabled"
                    ? "停用 Provider"
                    : "启用 Provider"}
                </Button>
              </div>
            </section>
            <ResponsiveData
              columns={[
                {
                  key: "family",
                  label: "模型族",
                  render: (row: ModelConfig) => row.modelFamily,
                },
                {
                  key: "name",
                  label: "显示名",
                  render: (row: ModelConfig) => row.displayName,
                },
                {
                  key: "status",
                  label: "状态",
                  render: (row: ModelConfig) => (
                    <StatusBadge
                      tone={row.status === "enabled" ? "success" : "neutral"}
                    >
                      {row.status === "enabled" ? "启用" : "停用"}
                    </StatusBadge>
                  ),
                },
                {
                  key: "web",
                  label: "原生联网",
                  render: (row: ModelConfig) =>
                    row.versions[0]?.nativeWebSearch ? "支持" : "不支持",
                },
                {
                  key: "action",
                  label: "操作",
                  render: (row: ModelConfig) => (
                    <Button
                      intent="ghost"
                      onClick={() => setSelectedId(row.id)}
                    >
                      配置
                    </Button>
                  ),
                },
              ]}
              rows={provider.modelConfigs}
            />
          </section>
          <div className="yc-side-stack">
            <section className="yc-card yc-section-card yc-form-card">
              <h2>更新方舟凭证</h2>
              <p>凭证不会回显，覆盖前需要二次邮箱验证。</p>
              <FormField label="新 API Key">
                <input
                  autoComplete="new-password"
                  onChange={(event) => setCredential(event.target.value)}
                  type="password"
                  value={credential}
                />
              </FormField>
              <div className="yc-actions">
                <Button
                  disabled={busy}
                  intent="ghost"
                  onClick={() =>
                    void execute(() =>
                      api.request("/auth/step-up-code-requests", {
                        method: "POST",
                      }),
                    )
                  }
                >
                  发送二次验证码
                </Button>
              </div>
              <FormField label="二次验证码">
                <input
                  maxLength={6}
                  onChange={(event) => setStepUpCode(event.target.value)}
                  value={stepUpCode}
                />
              </FormField>
              <div className="yc-actions">
                <Button
                  disabled={busy || stepUpCode.length !== 6}
                  intent="ghost"
                  onClick={() =>
                    void execute(() =>
                      api.request("/auth/step-up-code-verifications", {
                        body: JSON.stringify({ code: stepUpCode }),
                        method: "POST",
                      }),
                    )
                  }
                >
                  完成二次验证
                </Button>
                <Button
                  disabled={busy || credential.length < 8}
                  onClick={() =>
                    void execute(async () => {
                      await api.request(
                        `/admin/model-providers/${provider.id}/credential`,
                        {
                          body: JSON.stringify({ credential }),
                          method: "PUT",
                        },
                      );
                      setCredential("");
                    })
                  }
                >
                  加密保存
                </Button>
              </div>
            </section>
            {selected && version && (
              <ModelConfigForm
                busy={busy}
                config={selected}
                onSave={(body) =>
                  execute(() =>
                    api.request(`/admin/model-configs/${selected.id}`, {
                      body: JSON.stringify(body),
                      method: "PUT",
                    }),
                  )
                }
              />
            )}
          </div>
        </div>
      )}
      {calls.length > 0 && (
        <section className="yc-card yc-section-card">
          <h2>最近模型调用</h2>
          <ResponsiveData
            rows={calls}
            columns={[
              {
                key: "status",
                label: "状态",
                render: (row) => (
                  <StatusBadge
                    tone={row.status === "succeeded" ? "success" : "danger"}
                  >
                    {row.status}
                  </StatusBadge>
                ),
              },
              {
                key: "tokens",
                label: "Token",
                render: (row) => `${row.inputTokens} + ${row.outputTokens}`,
              },
              {
                key: "latency",
                label: "耗时",
                render: (row) => `${row.latencyMs} ms`,
              },
              {
                key: "cost",
                label: "成本微元",
                render: (row) => row.costMicros,
              },
              {
                key: "error",
                label: "错误",
                render: (row) => row.errorCode ?? "—",
              },
            ]}
          />
        </section>
      )}
    </>
  );
}

function ModelConfigForm({
  busy,
  config,
  onSave,
}: {
  readonly busy: boolean;
  readonly config: ModelConfig;
  readonly onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const version = config.versions[0]!;
  const [modelCode, setModelCode] = useState(version.modelCode);
  const [nativeWebSearch, setNativeWebSearch] = useState(
    version.nativeWebSearch,
  );
  return (
    <section className="yc-card yc-section-card yc-form-card" key={config.id}>
      <h2>配置 {config.modelFamily}</h2>
      <FormField
        hint="从当前方舟账户控制台选择，不根据品牌名猜测。"
        label="Model ID / Endpoint ID"
      >
        <input
          onChange={(event) => setModelCode(event.target.value)}
          value={modelCode}
        />
      </FormField>
      <label className="yc-checkbox-row">
        <input
          checked={nativeWebSearch}
          onChange={(event) => setNativeWebSearch(event.target.checked)}
          type="checkbox"
        />
        已经当前 Model ID + API 模式实测支持原生联网
      </label>
      <Button
        disabled={busy || !modelCode.trim()}
        onClick={() =>
          void onSave({
            apiMode: version.apiMode,
            displayName: config.displayName,
            inputPriceMicrosPerMillion:
              version.inputPriceMicrosPerMillion ?? "0",
            maxConcurrency: version.maxConcurrency,
            modelCode,
            nativeWebSearch,
            outputPriceMicrosPerMillion:
              version.outputPriceMicrosPerMillion ?? "0",
            status: config.status === "enabled" ? "disabled" : "enabled",
            timeoutMs: version.timeoutMs,
            ...(nativeWebSearch
              ? { webSearchConfig: { type: "web_search" } }
              : {}),
          })
        }
      >
        {config.status === "enabled" ? "保存并停用" : "保存并启用"}
      </Button>
    </section>
  );
}

function AdminHome() {
  const [data, setData] = useState<AdminDashboardResponse>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void api
      .request<AdminDashboardResponse>("/admin/dashboard")
      .then(setData)
      .catch((caught) => setError(messageFor(caught)));
  }, []);
  return (
    <>
      <PageHeader
        description="平台健康、模型运行和待处理事项的统一入口。"
        eyebrow="ADMIN"
        metadata={
          data
            ? `${new Date(data.dataFrom).toLocaleString("zh-CN")} — ${new Date(data.dataTo).toLocaleString("zh-CN")}`
            : "最近 24 小时运行数据"
        }
        title="管理首页"
      />
      {error ? (
        <StatePanel description={error} title="无法加载管理摘要" tone="error" />
      ) : !data ? (
        <Skeleton lines={5} />
      ) : (
        <>
          <div className="yc-metric-grid">
            <article>
              <strong>{data.users}</strong>
              <span>用户</span>
            </article>
            <article>
              <strong>{data.workspaces}</strong>
              <span>工作区</span>
            </article>
            <article>
              <strong>{data.projects}</strong>
              <span>项目</span>
            </article>
            <article>
              <strong>{data.jobs}</strong>
              <span>24h 任务</span>
            </article>
            <article>
              <strong>{data.failedJobs}</strong>
              <span>异常任务</span>
            </article>
            <article>
              <strong>{data.modelCalls}</strong>
              <span>模型调用</span>
            </article>
            <article>
              <strong>{data.failedCalls}</strong>
              <span>失败调用</span>
            </article>
            <article>
              <strong>{data.pendingOutbox}</strong>
              <span>待投递/死信</span>
            </article>
          </div>
          {(data.failedJobs > 0 || data.pendingOutbox > 0) && (
            <StatePanel
              description="存在异常任务或待处理事件，请进入任务和审计页面定位。"
              title="需要关注"
              tone="stale"
            />
          )}
        </>
      )}
    </>
  );
}

function AdminUsers() {
  const [rows, setRows] = useState<readonly AdminUserResponse[]>();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      setRows(
        await api.request<readonly AdminUserResponse[]>(
          `/admin/users${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
        ),
      );
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
    // Initial load deliberately uses the empty query; later searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="SUPPORT"
        title="用户与工作区"
        description="查看用户、角色、项目数量和额度流水，并执行受控状态变更。"
      />
      <div className="yc-actions">
        <input
          aria-label="搜索用户"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="邮箱"
          value={query}
        />
        <Button onClick={() => void load()}>搜索</Button>
      </div>
      {error ? (
        <StatePanel description={error} title="加载失败" tone="error" />
      ) : !rows ? (
        <Skeleton />
      ) : (
        <ResponsiveData
          rows={rows}
          columns={[
            { key: "email", label: "用户", render: (row) => row.displayEmail },
            {
              key: "status",
              label: "状态",
              render: (row) => (
                <StatusBadge
                  tone={row.status === "active" ? "success" : "danger"}
                >
                  {row.status}
                </StatusBadge>
              ),
            },
            {
              key: "workspaces",
              label: "工作区 / 项目",
              render: (row) =>
                row.memberships
                  .map(
                    (item) =>
                      `${item.workspace.name} (${item.role.code}, ${item.workspace._count.projects})`,
                  )
                  .join("；") || "—",
            },
            {
              key: "action",
              label: "操作",
              render: (row) => (
                <Button
                  intent="ghost"
                  onClick={() =>
                    void api
                      .request(`/admin/users/${row.id}/status`, {
                        body: JSON.stringify({
                          status:
                            row.status === "active" ? "suspended" : "active",
                        }),
                        method: "PATCH",
                      })
                      .then(load)
                      .catch((caught) => setError(messageFor(caught)))
                  }
                >
                  {row.status === "active" ? "停用" : "恢复"}
                </Button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

function AdminProjects() {
  const [rows, setRows] = useState<readonly AdminProjectResponse[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void api
      .request<readonly AdminProjectResponse[]>("/admin/projects")
      .then(setRows)
      .catch((caught) => setError(messageFor(caught)));
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="SUPPORT"
        title="项目"
        description="跨工作区只读查看项目上下文、品牌实体和最新任务状态。"
      />
      {error ? (
        <StatePanel description={error} title="加载失败" tone="error" />
      ) : !rows ? (
        <Skeleton />
      ) : (
        <ResponsiveData
          rows={rows}
          columns={[
            { key: "name", label: "项目", render: (row) => row.name },
            {
              key: "workspace",
              label: "工作区",
              render: (row) => row.workspace.name,
            },
            {
              key: "brand",
              label: "品牌",
              render: (row) => row.brandEntity?.canonicalName ?? "待确认",
            },
            { key: "status", label: "状态", render: (row) => row.status },
            {
              key: "job",
              label: "最新任务",
              render: (row) => row.analysisJobs[0]?.status ?? "—",
            },
          ]}
        />
      )}
    </>
  );
}

function AdminTasks() {
  const [rows, setRows] = useState<readonly AdminTaskResponse[]>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      setRows(
        await api.request<readonly AdminTaskResponse[]>(
          `/admin/tasks${status ? `?status=${status}` : ""}`,
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
    // Initial load deliberately shows all statuses; later filtering is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title="任务"
        description="查看任务状态、成功/失败子任务和处理时间。"
      />
      <div className="yc-actions">
        <select
          aria-label="任务状态"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">全部状态</option>
          <option value="running">运行中</option>
          <option value="failed">失败</option>
          <option value="partially_completed">部分成功</option>
          <option value="completed">完成</option>
        </select>
        <Button onClick={() => void load()}>筛选</Button>
      </div>
      {error ? (
        <StatePanel description={error} title="加载失败" tone="error" />
      ) : !rows ? (
        <Skeleton />
      ) : (
        <ResponsiveData
          rows={rows}
          columns={[
            {
              key: "project",
              label: "项目",
              render: (row) => row.project.name,
            },
            {
              key: "status",
              label: "状态",
              render: (row) => (
                <StatusBadge
                  tone={
                    row.status === "completed"
                      ? "success"
                      : row.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {row.status}
                </StatusBadge>
              ),
            },
            {
              key: "progress",
              label: "成功 / 总数",
              render: (row) => `${row.succeededRuns} / ${row.totalRuns}`,
            },
            { key: "failed", label: "失败", render: (row) => row.failedRuns },
            {
              key: "time",
              label: "创建时间",
              render: (row) => new Date(row.createdAt).toLocaleString("zh-CN"),
            },
          ]}
        />
      )}
    </>
  );
}

function AdminAgent() {
  const [question, setQuestion] = useState("");
  const [projectId, setProjectId] = useState("");
  const [runs, setRuns] = useState<readonly AgentRunResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = () =>
    api
      .request<readonly AgentRunResponse[]>("/admin/agent-runs")
      .then(setRuns)
      .catch((caught) => setError(messageFor(caught)));
  useEffect(() => {
    void load();
  }, []);
  const ask = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.request("/admin/agent-runs", {
        body: JSON.stringify({
          ...(projectId.trim() ? { projectId: projectId.trim() } : {}),
          question,
          tokenBudget: 2000,
        }),
        method: "POST",
      });
      setQuestion("");
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="OPENCLAW 2026.7.1"
        title="运营助手"
        description="只基于已注册 Skill 的实时数据回答；答案显示数据引用和运行消耗。"
      />
      {error && (
        <StatePanel description={error} title="运行失败" tone="error" />
      )}
      <section className="yc-card yc-section-card yc-form-card">
        <FormField
          label="问题"
          hint="例如：平台概览、模型健康、队列是否有死信；查看报告时填写项目 ID。"
        >
          <textarea
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            value={question}
          />
        </FormField>
        <FormField label="项目 ID（可选）">
          <input
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          />
        </FormField>
        <Button disabled={busy || !question.trim()} onClick={() => void ask()}>
          {busy ? "运行中…" : "运行助手"}
        </Button>
      </section>
      {runs.length === 0 ? (
        <StatePanel
          description="提交问题后，运行、Skill 和引用会显示在这里。"
          title="暂无运行"
        />
      ) : (
        runs.map((run) => (
          <section className="yc-card yc-section-card" key={run.id}>
            <div className="yc-section-heading">
              <div>
                <h2>{new Date(run.createdAt).toLocaleString("zh-CN")}</h2>
                <p>
                  OpenClaw {run.runtimeVersion} · Token{" "}
                  {run.inputTokens + run.outputTokens} · 成本 {run.costMicros}{" "}
                  微元
                </p>
              </div>
              <StatusBadge
                tone={run.status === "succeeded" ? "success" : "danger"}
              >
                {run.status}
              </StatusBadge>
            </div>
            <p>{run.answer ?? run.errorCode ?? "无回答"}</p>
            <ul className="yc-plain-list">
              {run.citations.map((item) => (
                <li key={item.citation}>
                  <span>
                    <strong>{item.skill}</strong>
                    <small>{item.citation}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function TelegramSettings() {
  const [config, setConfig] = useState<TelegramConfigResponse>();
  const [deliveries, setDeliveries] = useState<
    readonly NotificationDeliveryResponse[]
  >([]);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      const next = await api.request<TelegramConfigResponse>(
        "/admin/notification-channels/telegram",
      );
      setConfig(next);
      setEnabled(next.enabled);
      setDeliveries(
        await api.request<readonly NotificationDeliveryResponse[]>(
          "/admin/notification-deliveries",
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, []);
  const run = async (operation: () => Promise<unknown>) => {
    try {
      setError(undefined);
      await operation();
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="ADMIN ONLY"
        title="Telegram 通知渠道"
        description="Token 与 Chat ID 加密保存且永不回显；测试消息有幂等与限流。"
      />
      {error && (
        <StatePanel description={error} title="操作失败" tone="error" />
      )}
      <div className="yc-content-grid">
        <section className="yc-card yc-section-card yc-form-card">
          <h2>渠道配置</h2>
          <p>
            {config?.configured
              ? `已配置：${config.tokenHint} / ${config.chatIdHint}`
              : "尚未配置"}
          </p>
          <FormField label="Bot Token">
            <input
              autoComplete="new-password"
              onChange={(event) => setToken(event.target.value)}
              type="password"
              value={token}
            />
          </FormField>
          <FormField label="Chat ID">
            <input
              autoComplete="off"
              onChange={(event) => setChatId(event.target.value)}
              type="password"
              value={chatId}
            />
          </FormField>
          <label className="yc-checkbox-row">
            <input
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              type="checkbox"
            />
            启用渠道
          </label>
          <Button
            intent="ghost"
            onClick={() =>
              void run(() =>
                api.request("/auth/step-up-code-requests", { method: "POST" }),
              )
            }
          >
            发送二次验证码
          </Button>
          <FormField label="二次验证码">
            <input
              maxLength={6}
              onChange={(event) => setCode(event.target.value)}
              value={code}
            />
          </FormField>
          <div className="yc-actions">
            <Button
              disabled={code.length !== 6}
              intent="ghost"
              onClick={() =>
                void run(() =>
                  api.request("/auth/step-up-code-verifications", {
                    body: JSON.stringify({ code }),
                    method: "POST",
                  }),
                )
              }
            >
              完成验证
            </Button>
            <Button
              disabled={token.length < 20 || chatId.length < 8}
              onClick={() =>
                void run(() =>
                  api.request("/admin/notification-channels/telegram", {
                    body: JSON.stringify({ chatId, enabled, token }),
                    method: "PUT",
                  }),
                )
              }
            >
              加密保存
            </Button>
            <Button
              disabled={!config?.configured}
              onClick={() =>
                void run(() =>
                  api.request("/admin/notification-channels/telegram/test", {
                    headers: {
                      "Idempotency-Key": globalThis.crypto.randomUUID(),
                    },
                    method: "POST",
                  }),
                )
              }
            >
              发送测试消息
            </Button>
          </div>
        </section>
        <section>
          {deliveries.length ? (
            <ResponsiveData
              rows={deliveries}
              columns={[
                {
                  key: "status",
                  label: "状态",
                  render: (row) => (
                    <StatusBadge
                      tone={row.status === "sent" ? "success" : "danger"}
                    >
                      {row.status}
                    </StatusBadge>
                  ),
                },
                {
                  key: "attempts",
                  label: "尝试",
                  render: (row) => row.attempts,
                },
                {
                  key: "error",
                  label: "错误",
                  render: (row) => row.errorCode ?? "—",
                },
                {
                  key: "time",
                  label: "时间",
                  render: (row) =>
                    new Date(row.createdAt).toLocaleString("zh-CN"),
                },
              ]}
            />
          ) : (
            <StatePanel
              description="发送测试消息后会记录脱敏投递结果。"
              title="暂无投递"
            />
          )}
        </section>
      </div>
    </>
  );
}

function AuditLogs() {
  const [rows, setRows] = useState<readonly AuditRow[]>();
  const [error, setError] = useState<string>();
  const [action, setAction] = useState("");
  const load = (filter = "") =>
    api
      .request<readonly AuditRow[]>(
        `/admin/audit-logs?limit=50${filter ? `&action=${encodeURIComponent(filter)}` : ""}`,
      )
      .then(setRows)
      .catch((caught) => setError(messageFor(caught)));
  useEffect(() => {
    void load();
  }, []);
  const columns: readonly ResponsiveColumn<AuditRow>[] = [
    { key: "action", label: "操作", render: (row) => row.action },
    { key: "object", label: "对象", render: (row) => row.objectType },
    {
      key: "outcome",
      label: "结果",
      render: (row) => (
        <StatusBadge tone={row.outcome === "success" ? "success" : "danger"}>
          {row.outcome === "success" ? "成功" : "失败"}
        </StatusBadge>
      ),
    },
    {
      key: "actor",
      label: "操作者",
      render: (row) => row.actorEmailMask ?? "系统",
    },
    {
      key: "time",
      label: "时间（UTC）",
      render: (row) =>
        new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19),
      secondary: true,
    },
    {
      key: "request",
      label: "请求 ID",
      render: (row) => row.requestId,
      secondary: true,
    },
  ];
  return (
    <>
      <PageHeader
        description="管理写操作、敏感配置和 Agent 动作的追加式记录。"
        eyebrow="安全"
        title="审计日志"
      />
      <div className="yc-actions">
        <input
          aria-label="按操作筛选"
          onChange={(event) => setAction(event.target.value)}
          placeholder="例如 report.publish"
          value={action}
        />
        <Button onClick={() => void load(action.trim())}>筛选</Button>
      </div>
      {error ? (
        <StatePanel description={error} title="无法加载审计日志" tone="error" />
      ) : !rows ? (
        <Skeleton lines={6} />
      ) : rows.length === 0 ? (
        <StatePanel
          description="产生管理操作后，记录会显示在这里。"
          title="暂无审计记录"
        />
      ) : (
        <ResponsiveData columns={columns} rows={rows} />
      )}
    </>
  );
}

function AdminPlaceholder({ path }: { readonly path: string }) {
  const item = navigation.find((candidate) => candidate.href === path);
  return (
    <>
      <PageHeader eyebrow="ADMIN" title={item?.label ?? "管理页面"} />
      <StatePanel
        description="权限化菜单已就绪，该管理能力会在对应版本接入真实数据。"
        title="模块建设中"
      />
    </>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.detail.message}${error.detail.requestId ? `（请求 ${error.detail.requestId}）` : ""}`;
  return "网络连接失败，请检查后重试。";
}
