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
import { useEffect, useMemo, useState } from "react";
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
  readonly contextWindow?: number | null;
  readonly inputPriceMicrosPerMillion: string | null;
  readonly maxConcurrency: number;
  readonly modelCode: string;
  readonly nativeWebSearch: boolean;
  readonly outputPriceMicrosPerMillion: string | null;
  readonly probedAt?: string | null;
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

interface ModelProbeResult {
  readonly errorCode: string | null;
  readonly inputTokens: number;
  readonly latencyMs: number;
  readonly modelCode: string;
  readonly outputTokens: number;
  readonly probedAt: string | null;
  readonly status: "succeeded" | "failed";
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

interface AlertResponse {
  readonly acknowledgedAt?: string | null;
  readonly body: string;
  readonly firstTriggeredAt: string;
  readonly id: string;
  readonly lastTriggeredAt: string;
  readonly metricValue: string;
  readonly occurrenceCount: number;
  readonly resolvedAt?: string | null;
  readonly ruleCode: string;
  readonly severity: "warning" | "critical";
  readonly status: "active" | "resolved";
  readonly thresholdValue: string;
  readonly title: string;
  readonly unit: string;
}

const navigation: readonly NavigationItem[] = [
  { href: "/admin", icon: "dashboard", label: "管理首页" },
  { href: "/admin/users", icon: "team", label: "用户与工作区" },
  { href: "/admin/projects", icon: "projects", label: "项目" },
  { href: "/admin/tasks", icon: "tasks", label: "任务" },
  { href: "/admin/models", icon: "models", label: "模型" },
  { href: "/admin/agent", icon: "agent", label: "运营助手" },
  { href: "/admin/alerts", icon: "notifications", label: "告警" },
  {
    href: "/admin/notification-channels",
    icon: "notifications",
    label: "通知渠道",
  },
  { href: "/admin/usage", icon: "usage", label: "用量" },
  { href: "/admin/audit-logs", icon: "audit", label: "审计日志" },
];

export function App() {
  const [session, setSession] = useState<SessionView>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void api
      .getSession()
      .then((next) => setSession(next.audience === "admin" ? next : undefined))
      .catch(() => setSession(undefined))
      .finally(() => setLoading(false));
  }, []);
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
      onLogout={() => {
        void api.request("/auth/logout", { method: "POST" }).finally(() => {
          api.setSession(undefined);
          globalThis.location.href = "/login";
        });
      }}
      userEmail={session.email}
    >
      <Routes>
        <Route path="/" element={<Navigate replace to="/admin" />} />
        <Route path="/dashboard" element={<Navigate replace to="/admin" />} />
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/workspaces" element={<AdminUsers />} />
        <Route path="/admin/projects" element={<AdminProjects />} />
        <Route path="/admin/tasks" element={<AdminTasks />} />
        <Route path="/admin/agent" element={<AdminAgent />} />
        <Route path="/admin/agent/runs" element={<AdminAgent />} />
        <Route path="/admin/alerts" element={<AdminAlerts />} />
        <Route path="/admin/alert-rules" element={<AdminAlerts />} />
        <Route
          path="/admin/notification-channels"
          element={<TelegramSettings />}
        />
        <Route path="/admin/models" element={<ModelManagement />} />
        <Route path="/admin/usage" element={<AdminUsage />} />
        <Route path="/admin/audit-logs" element={<AuditLogs />} />
        <Route path="*" element={<AdminNotFound />} />
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
  const execute = async <T,>(
    operation: () => Promise<T>,
  ): Promise<T | undefined> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await operation();
      await load();
      return result;
    } catch (caught) {
      setError(messageFor(caught));
      return undefined;
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
        description="集中管理火山方舟接入、模型版本、价格、能力和可用状态。"
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
                  label: "联网能力",
                  render: (row: ModelConfig) =>
                    row.versions[0]?.nativeWebSearch ? "支持" : "不支持",
                },
                {
                  key: "probe",
                  label: "最近探测",
                  render: (row: ModelConfig) =>
                    row.versions[0]?.probedAt
                      ? adminFormatDateTime(row.versions[0].probedAt)
                      : "未探测",
                  secondary: true,
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
                key={selected.id}
                onProbe={() =>
                  execute(() =>
                    api.request<ModelProbeResult>(
                      `/admin/model-configs/${selected.id}/probe`,
                      { method: "POST" },
                    ),
                  )
                }
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
                    {executionStatusLabel(row.status)}
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
                label: "费用",
                render: (row) => adminFormatMicros(BigInt(row.costMicros)),
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
  onProbe,
  onSave,
}: {
  readonly busy: boolean;
  readonly config: ModelConfig;
  readonly onProbe: () => Promise<ModelProbeResult | undefined>;
  readonly onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const version = config.versions[0]!;
  const [displayName, setDisplayName] = useState(config.displayName);
  const [modelCode, setModelCode] = useState(version.modelCode);
  const [apiMode, setApiMode] = useState(version.apiMode);
  const [contextWindow, setContextWindow] = useState(
    version.contextWindow?.toString() ?? "",
  );
  const [inputPrice, setInputPrice] = useState(
    microsToYuanInput(version.inputPriceMicrosPerMillion ?? "0"),
  );
  const [outputPrice, setOutputPrice] = useState(
    microsToYuanInput(version.outputPriceMicrosPerMillion ?? "0"),
  );
  const [maxConcurrency, setMaxConcurrency] = useState(
    version.maxConcurrency.toString(),
  );
  const [timeoutMs, setTimeoutMs] = useState(version.timeoutMs.toString());
  const [nativeWebSearch, setNativeWebSearch] = useState(
    version.nativeWebSearch,
  );
  const [probeResult, setProbeResult] = useState<ModelProbeResult>();
  const body = (status: ModelConfig["status"]) => ({
    apiMode,
    ...(contextWindow ? { contextWindow: Number(contextWindow) } : {}),
    displayName,
    inputPriceMicrosPerMillion: yuanInputToMicros(inputPrice),
    maxConcurrency: Number(maxConcurrency),
    modelCode,
    nativeWebSearch,
    outputPriceMicrosPerMillion: yuanInputToMicros(outputPrice),
    status,
    timeoutMs: Number(timeoutMs),
    ...(nativeWebSearch ? { webSearchConfig: { type: "web_search" } } : {}),
  });
  const valid =
    Boolean(displayName.trim() && modelCode.trim()) &&
    Number(maxConcurrency) >= 1 &&
    Number(timeoutMs) >= 1_000 &&
    (!contextWindow || Number(contextWindow) > 0) &&
    /^\d+(?:\.\d{1,6})?$/.test(inputPrice) &&
    /^\d+(?:\.\d{1,6})?$/.test(outputPrice);
  const dirty =
    displayName !== config.displayName ||
    modelCode !== version.modelCode ||
    apiMode !== version.apiMode ||
    contextWindow !== (version.contextWindow?.toString() ?? "") ||
    inputPrice !==
      microsToYuanInput(version.inputPriceMicrosPerMillion ?? "0") ||
    outputPrice !==
      microsToYuanInput(version.outputPriceMicrosPerMillion ?? "0") ||
    maxConcurrency !== version.maxConcurrency.toString() ||
    timeoutMs !== version.timeoutMs.toString() ||
    nativeWebSearch !== version.nativeWebSearch;
  return (
    <section className="yc-card yc-section-card yc-form-card" key={config.id}>
      <h2>配置 {config.modelFamily}</h2>
      <FormField label="显示名称">
        <input
          maxLength={100}
          onChange={(event) => setDisplayName(event.target.value)}
          value={displayName}
        />
      </FormField>
      <FormField
        hint="从当前方舟账户控制台选择，不根据品牌名猜测。"
        label="Model ID / Endpoint ID"
      >
        <input
          onChange={(event) => setModelCode(event.target.value)}
          value={modelCode}
        />
      </FormField>
      <FormField label="API 模式">
        <select
          onChange={(event) =>
            setApiMode(event.target.value as "responses" | "chat_completions")
          }
          value={apiMode}
        >
          <option value="responses">Responses</option>
          <option value="chat_completions">Chat Completions</option>
        </select>
      </FormField>
      <FormField hint="例如 256000；未知时可留空。" label="上下文窗口">
        <input
          inputMode="numeric"
          min={1}
          onChange={(event) => setContextWindow(event.target.value)}
          type="number"
          value={contextWindow}
        />
      </FormField>
      <FormField hint="最多保留 6 位小数。" label="输入价格（元/百万 Token）">
        <input
          inputMode="decimal"
          min={0}
          onChange={(event) => setInputPrice(event.target.value)}
          step="0.000001"
          type="number"
          value={inputPrice}
        />
      </FormField>
      <FormField hint="最多保留 6 位小数。" label="输出价格（元/百万 Token）">
        <input
          inputMode="decimal"
          min={0}
          onChange={(event) => setOutputPrice(event.target.value)}
          step="0.000001"
          type="number"
          value={outputPrice}
        />
      </FormField>
      <FormField label="最大并发">
        <input
          inputMode="numeric"
          max={100}
          min={1}
          onChange={(event) => setMaxConcurrency(event.target.value)}
          type="number"
          value={maxConcurrency}
        />
      </FormField>
      <FormField label="超时（毫秒）">
        <input
          inputMode="numeric"
          max={300000}
          min={1000}
          onChange={(event) => setTimeoutMs(event.target.value)}
          type="number"
          value={timeoutMs}
        />
      </FormField>
      <label className="yc-checkbox-row">
        <input
          checked={nativeWebSearch}
          onChange={(event) => setNativeWebSearch(event.target.checked)}
          type="checkbox"
        />
        已确认当前 Model ID 与 API 模式支持联网
      </label>
      <div className="yc-actions">
        <Button
          disabled={busy || !valid}
          intent="ghost"
          onClick={() => void onSave(body(config.status))}
        >
          保存配置
        </Button>
        <Button
          disabled={busy || dirty}
          intent="ghost"
          onClick={() =>
            void onProbe().then((result) => {
              if (result) setProbeResult(result);
            })
          }
        >
          探测已保存配置
        </Button>
        <Button
          disabled={busy || !valid}
          onClick={() =>
            void onSave(
              body(config.status === "enabled" ? "disabled" : "enabled"),
            )
          }
        >
          {config.status === "enabled" ? "保存并停用" : "保存并启用"}
        </Button>
      </div>
      {dirty && <p>配置已修改，请先保存，再对已保存版本进行真实探测。</p>}
      {(probeResult || version.probedAt) && (
        <StatePanel
          description={
            probeResult
              ? probeResult.status === "succeeded"
                ? `${probeResult.modelCode} · ${probeResult.latencyMs} ms · ${probeResult.inputTokens} + ${probeResult.outputTokens} Token`
                : `${probeResult.modelCode} · ${probeResult.errorCode ?? "MODEL_PROBE_FAILED"}`
              : `最近成功：${adminFormatDateTime(version.probedAt!)}`
          }
          title={
            probeResult?.status === "failed" ? "模型探测失败" : "模型探测通过"
          }
          tone={probeResult?.status === "failed" ? "error" : "empty"}
        />
      )}
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
        description="查看平台运行状态、模型调用和待处理事项。"
        metadata={
          data
            ? `${adminFormatDateTime(data.dataFrom)} — ${adminFormatDateTime(data.dataTo)}`
            : "最近 24 小时运行数据"
        }
        title="运营概览"
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
                  {accountStatusLabel(row.status)}
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
                      `${item.workspace.name}（${adminRoleLabel(item.role.code)}，${item.workspace._count.projects} 个项目）`,
                  )
                  .join("；") || "—",
            },
            {
              key: "action",
              label: "操作",
              render: (row) => (
                <Button
                  intent="ghost"
                  onClick={() => {
                    const next =
                      row.status === "active" ? "suspended" : "active";
                    if (
                      !globalThis.confirm(
                        next === "suspended"
                          ? `确认停用 ${row.displayEmail}？其现有会话会立即失效。`
                          : `确认恢复 ${row.displayEmail} 的访问权限？`,
                      )
                    )
                      return;
                    void api
                      .request(`/admin/users/${row.id}/status`, {
                        body: JSON.stringify({ status: next }),
                        method: "PATCH",
                      })
                      .then(load)
                      .catch((caught) => setError(messageFor(caught)));
                  }}
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
            {
              key: "status",
              label: "状态",
              render: (row) => projectStatusLabel(row.status),
            },
            {
              key: "job",
              label: "最新任务",
              render: (row) =>
                row.analysisJobs[0]
                  ? executionStatusLabel(row.analysisJobs[0].status)
                  : "暂无任务",
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
                  {executionStatusLabel(row.status)}
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
              render: (row) => adminFormatDateTime(row.createdAt),
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
  const [projects, setProjects] = useState<readonly AdminProjectResponse[]>([]);
  const [runs, setRuns] = useState<readonly AgentRunResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = () =>
    Promise.all([
      api.request<readonly AgentRunResponse[]>("/admin/agent-runs"),
      api.request<readonly AdminProjectResponse[]>("/admin/projects"),
    ])
      .then(([nextRuns, nextProjects]) => {
        setRuns(nextRuns);
        setProjects(nextProjects);
        setError(undefined);
      })
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
        title="运营助手"
        description="基于平台实时数据回答运营问题，并展示数据来源与本次运行消耗。"
      />
      {error && (
        <StatePanel description={error} title="运行失败" tone="error" />
      )}
      <section className="yc-card yc-section-card yc-form-card">
        <FormField
          label="问题"
          hint="例如：平台整体运行是否正常？哪些分析任务需要关注？"
        >
          <textarea
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            value={question}
          />
        </FormField>
        <FormField label="关联项目（可选）">
          <select
            onChange={(event) => setProjectId(event.target.value)}
            value={projectId}
          >
            <option value="">不限定项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.workspace.name} · {project.name}
              </option>
            ))}
          </select>
        </FormField>
        <Button disabled={busy || !question.trim()} onClick={() => void ask()}>
          {busy ? "运行中…" : "运行助手"}
        </Button>
      </section>
      {runs.length === 0 ? (
        <StatePanel
          description="提交问题后，运行状态和数据来源会显示在这里。"
          title="暂无运行"
        />
      ) : (
        runs.map((run) => (
          <section className="yc-card yc-section-card" key={run.id}>
            <div className="yc-section-heading">
              <div>
                <h2>{adminFormatDateTime(run.createdAt)}</h2>
                <p>
                  运行版本 {run.runtimeVersion} · Token{" "}
                  {run.inputTokens + run.outputTokens} · 费用{" "}
                  {adminFormatMicros(BigInt(run.costMicros))}
                </p>
              </div>
              <StatusBadge
                tone={run.status === "succeeded" ? "success" : "danger"}
              >
                {executionStatusLabel(run.status)}
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

function AdminAlerts() {
  const [rows, setRows] = useState<readonly AlertResponse[]>();
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const load = () =>
    api
      .request<readonly AlertResponse[]>("/admin/alerts")
      .then((result) => {
        setRows(result);
        setError(undefined);
      })
      .catch((caught) => setError(messageFor(caught)));
  useEffect(() => {
    void load();
    const timer = globalThis.setInterval(() => void load(), 60_000);
    return () => globalThis.clearInterval(timer);
  }, []);
  return (
    <>
      <PageHeader
        title="平台告警"
        description="确定性规则每分钟评估；同一异常合并，30 分钟内不重复提醒，恢复后自动关闭。"
        actions={<Button onClick={() => void load()}>刷新</Button>}
      />
      <section className="yc-card yc-section-card">
        <div className="yc-section-heading">
          <div>
            <h2>固定规则</h2>
            <p>规则由平台统一管理，不依赖运营助手判断。</p>
          </div>
        </div>
        <ul className="yc-plain-list">
          <li>模型失败率：最近 5 分钟 ≥ 10%</li>
          <li>队列等待：超过 10 分钟的任务 ≥ 500</li>
          <li>模型成本：本小时比过去 7 天同期均值高 ≥ 50%</li>
          <li>报告耗时：最近 15 分钟平均 ≥ 5 分钟</li>
        </ul>
      </section>
      {error ? (
        <StatePanel description={error} title="告警加载失败" tone="error" />
      ) : !rows ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <StatePanel
          description="模型、队列、成本和报告耗时目前都未触发阈值。"
          title="当前没有告警"
        />
      ) : (
        <ResponsiveData
          rows={rows}
          columns={[
            {
              key: "alert",
              label: "告警",
              render: (row) => (
                <div>
                  <strong>{row.title}</strong>
                  <small className="yc-table-secondary">{row.body}</small>
                </div>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (row) => (
                <StatusBadge
                  tone={
                    row.status === "resolved"
                      ? "success"
                      : row.severity === "critical"
                        ? "danger"
                        : "warning"
                  }
                >
                  {row.status === "resolved"
                    ? "已恢复"
                    : row.severity === "critical"
                      ? "严重"
                      : "告警中"}
                </StatusBadge>
              ),
            },
            {
              key: "metric",
              label: "指标 / 阈值",
              render: (row) =>
                `${formatAlertMetric(row.metricValue, row.unit)} / ${formatAlertMetric(row.thresholdValue, row.unit)}`,
            },
            {
              key: "occurrences",
              label: "命中次数",
              render: (row) => row.occurrenceCount,
            },
            {
              key: "acknowledgement",
              label: "确认",
              render: (row) =>
                row.acknowledgedAt ? (
                  `已确认 · ${adminFormatDateTime(row.acknowledgedAt)}`
                ) : row.status === "active" ? (
                  <Button
                    disabled={busyId === row.id}
                    intent="ghost"
                    onClick={() => {
                      setBusyId(row.id);
                      void api
                        .request(`/admin/alerts/${row.id}/acknowledge`, {
                          method: "PATCH",
                        })
                        .then(() => load())
                        .catch((caught) => setError(messageFor(caught)))
                        .finally(() => setBusyId(undefined));
                    }}
                  >
                    {busyId === row.id ? "确认中…" : "确认告警"}
                  </Button>
                ) : (
                  "—"
                ),
            },
            {
              key: "time",
              label: "最近命中",
              render: (row) => adminFormatDateTime(row.lastTriggeredAt),
            },
          ]}
        />
      )}
    </>
  );
}

function formatAlertMetric(value: string, unit: string) {
  const number = Number(value);
  if (unit === "percent") return `${number.toFixed(1)}%`;
  if (unit === "seconds") return `${Math.round(number)} 秒`;
  return `${Math.round(number)} 个`;
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
                      {deliveryStatusLabel(row.status)}
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
                  render: (row) => adminFormatDateTime(row.createdAt),
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

function AdminUsage() {
  const [users, setUsers] = useState<readonly AdminUserResponse[]>();
  const [workspaceId, setWorkspaceId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      setUsers(await api.request<readonly AdminUserResponse[]>("/admin/users"));
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, []);
  const workspaces = useMemo(() => {
    const unique = new Map<
      string,
      {
        id: string;
        name: string;
        projectCount: number;
        usageMicros: bigint;
      }
    >();
    for (const user of users ?? [])
      for (const membership of user.memberships) {
        const workspace = membership.workspace;
        if (unique.has(workspace.id)) continue;
        unique.set(workspace.id, {
          id: workspace.id,
          name: workspace.name,
          projectCount: workspace._count.projects,
          usageMicros: workspace.usageLedgerEntries.reduce(
            (sum, entry) => sum + BigInt(entry.quantityMicros),
            0n,
          ),
        });
      }
    return [...unique.values()];
  }, [users]);
  const selectedWorkspaceId = workspaceId || workspaces[0]?.id || "";
  const adjust = async () => {
    const numeric = Number(amount);
    if (!selectedWorkspaceId || !Number.isFinite(numeric) || numeric === 0)
      return;
    if (
      !globalThis.confirm(
        `确认${numeric > 0 ? "增加" : "扣减"} ${Math.abs(numeric).toFixed(2)} 元额度？该操作将保留完整记录。`,
      )
    )
      return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request(
        `/admin/workspaces/${selectedWorkspaceId}/quota-adjustments`,
        {
          body: JSON.stringify({
            quantityMicros: Math.round(numeric * 1_000_000).toString(),
            reason: reason.trim(),
          }),
          method: "POST",
        },
      );
      setAmount("");
      setReason("");
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
        description="查看各工作区额度汇总，并执行有完整操作记录的额度调整。"
        title="用量与额度"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      {!users ? (
        <Skeleton lines={6} />
      ) : (
        <div className="yc-content-grid">
          <section>
            {workspaces.length ? (
              <ResponsiveData
                columns={[
                  {
                    key: "workspace",
                    label: "工作区",
                    render: (row: (typeof workspaces)[number]) => row.name,
                  },
                  {
                    key: "balance",
                    label: "当前额度",
                    render: (row: (typeof workspaces)[number]) =>
                      adminFormatMicros(row.usageMicros),
                  },
                  {
                    key: "projects",
                    label: "项目",
                    render: (row: (typeof workspaces)[number]) =>
                      row.projectCount,
                  },
                  {
                    key: "id",
                    label: "工作区 ID",
                    render: (row: (typeof workspaces)[number]) => row.id,
                    secondary: true,
                  },
                ]}
                rows={workspaces}
              />
            ) : (
              <StatePanel
                description="创建工作区后会显示额度汇总。"
                title="暂无工作区"
              />
            )}
          </section>
          <section className="yc-card yc-section-card">
            <h2>调整额度</h2>
            <FormField label="工作区">
              <select
                onChange={(event) => setWorkspaceId(event.target.value)}
                value={selectedWorkspaceId}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              hint="正数增加额度，负数扣减额度。"
              label="调整金额（元）"
            >
              <input
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                step="0.01"
                type="number"
                value={amount}
              />
            </FormField>
            <FormField
              hint="至少 3 个字符，会随账本和审计记录保存。"
              label="调整原因"
            >
              <textarea
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                value={reason}
              />
            </FormField>
            <Button
              disabled={
                busy ||
                !selectedWorkspaceId ||
                !amount ||
                reason.trim().length < 3
              }
              onClick={() => void adjust()}
            >
              {busy ? "提交中…" : "确认调整"}
            </Button>
          </section>
        </div>
      )}
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
      label: "时间",
      render: (row) => adminFormatDateTime(row.createdAt),
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
        description="查询管理操作、敏感配置变更和运营助手动作的完整记录。"
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

function AdminNotFound() {
  return (
    <>
      <PageHeader title="管理页面不存在" />
      <StatePanel
        action={
          <Button onClick={() => (globalThis.location.href = "/admin")}>
            返回管理首页
          </Button>
        }
        description="当前地址无对应管理能力，或当前管理员没有访问权限。"
        title="无法打开此页面"
        tone="error"
      />
    </>
  );
}

function adminFormatMicros(value: bigint): string {
  return new Intl.NumberFormat("zh-CN", {
    currency: "CNY",
    maximumFractionDigits: 6,
    style: "currency",
  }).format(Number(value) / 1_000_000);
}

function microsToYuanInput(value: string): string {
  const micros = BigInt(value);
  const yuan = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${yuan}.${fraction}` : yuan.toString();
}

function yuanInputToMicros(value: string): string {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) return "0";
  const yuan = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return (yuan * 1_000_000n + fraction).toString();
}

function executionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    budget_exceeded: "超出预算",
    cancelled: "已取消",
    completed: "已完成",
    failed: "失败",
    outcome_unknown: "结果待确认",
    partially_completed: "部分完成",
    pending: "等待中",
    queued: "排队中",
    running: "运行中",
    succeeded: "成功",
  };
  return labels[status] ?? "未知状态";
}

function accountStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "正常",
    disabled: "已停用",
    suspended: "已暂停",
  };
  return labels[status] ?? "未知状态";
}

function projectStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "运行中",
    archived: "已归档",
    confirmed: "已确认",
    draft: "草稿",
    identifying: "识别中",
    ready: "已就绪",
    waiting_confirmation: "待确认",
  };
  return labels[status] ?? "未知状态";
}

function deliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    failed: "发送失败",
    pending: "等待发送",
    queued: "等待发送",
    retrying: "重试中",
    sending: "发送中",
    sent: "已发送",
  };
  return labels[status] ?? "未知状态";
}

function adminRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "管理员",
    analyst: "分析师",
    operator: "运营",
    owner: "所有者",
    super_admin: "超级管理员",
    viewer: "查看者",
  };
  return labels[role] ?? "自定义角色";
}

function adminFormatDateTime(value: string): string {
  return `${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value))}（北京时间）`;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.detail.message}${error.detail.requestId ? `（请求 ${error.detail.requestId}）` : ""}`;
  return "网络连接失败，请检查后重试。";
}
