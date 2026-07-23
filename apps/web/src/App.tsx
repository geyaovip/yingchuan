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
  type WorkspaceOption,
} from "@yingchuan/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { api } from "./api";
import { projectNavigation } from "./navigation";

interface WorkspaceResponse extends WorkspaceOption {
  readonly memberships: readonly {
    readonly role: { readonly code: string };
  }[];
  readonly slug: string;
  readonly version: number;
}

interface ProjectResponse {
  readonly brandCandidates: readonly BrandCandidate[];
  readonly brandEntity?: {
    readonly canonicalName: string;
    readonly country?: string;
    readonly officialWebsite?: string;
    readonly primaryLanguage?: string;
  };
  readonly capabilities: readonly {
    readonly code: string;
    readonly enabled: boolean;
  }[];
  readonly id: string;
  readonly identificationJobs: readonly {
    readonly id: string;
    readonly status: string;
  }[];
  readonly knowledgeSources: readonly KnowledgeSource[];
  readonly name: string;
  readonly onboardingStatus: string;
  readonly status: string;
  readonly version: number;
}

interface BrandCandidate {
  readonly displayName: string;
  readonly id: string;
  readonly officialWebsite?: string;
  readonly status: string;
}

interface KnowledgeSource {
  readonly id: string;
  readonly lastSuccessfulFetchedAt?: string;
  readonly originalUrl: string;
  readonly status: string;
  readonly type: string;
  readonly version: number;
}

interface PromptResponse {
  readonly category: string;
  readonly city?: string;
  readonly country?: string;
  readonly district?: string;
  readonly enabled: boolean;
  readonly groupKey?: string;
  readonly id: string;
  readonly language: string;
  readonly nearbyLandmark?: string;
  readonly priority: number;
  readonly province?: string;
  readonly requiresWebSearch: boolean;
  readonly scope: string;
  readonly targetStoreId?: string;
  readonly text: string;
  readonly version: number;
}

interface AnalysisEstimateResponse {
  readonly eligibleRunCount: number;
  readonly estimatedCostMicros: string;
  readonly skippedRunCount: number;
}

interface UsageResponse {
  readonly balanceMicros: string;
  readonly currency: string;
  readonly entries: readonly {
    readonly createdAt: string;
    readonly entryType: string;
    readonly id: string;
    readonly quantityMicros: string;
    readonly source: string;
  }[];
}

interface AnalysisJobResponse {
  readonly cancelledRuns: number;
  readonly createdAt: string;
  readonly estimatedCostMicros: string;
  readonly failedRuns: number;
  readonly id: string;
  readonly queuedRuns: number;
  readonly runningRuns: number;
  readonly skippedRuns: number;
  readonly status: string;
  readonly succeededRuns: number;
  readonly totalRuns: number;
  readonly runs?: readonly {
    readonly errorCode?: string;
    readonly id: string;
    readonly modelConfigVersion: {
      readonly modelConfig: {
        readonly displayName: string;
        readonly modelFamily: string;
      };
    };
    readonly promptVersion: { readonly text: string };
    readonly status: string;
  }[];
}

interface VisibilityScoreResponse {
  readonly confidence: number;
  readonly confidenceLevel: string;
  readonly diagnosticOnly: boolean;
  readonly dimensions: readonly {
    readonly dimensionCode: string;
    readonly value?: number;
  }[];
  readonly overallScore: number;
  readonly scoreVersion: string;
}

interface CompetitorResponse {
  readonly canonicalName: string;
  readonly evidenceCount: number;
  readonly id: string;
  readonly status: string;
  readonly version: number;
}

interface ReportVersionResponse {
  readonly contentSnapshot: {
    readonly confidence: number;
    readonly failedRuns: number;
    readonly modelBreakdown: readonly {
      readonly model: string;
      readonly prompt: string;
      readonly status: string;
    }[];
    readonly overallScore: number;
    readonly scoreVersion: string;
    readonly successfulRuns: number;
  };
  readonly id: string;
  readonly limitationSummary?: string;
  readonly recommendations: readonly {
    readonly category: string;
    readonly description: string;
    readonly effort: string;
    readonly id: string;
    readonly impact: string;
    readonly priority: string;
    readonly title: string;
  }[];
  readonly status: string;
  readonly title: string;
  readonly versionNumber: number;
}
interface NotificationResponse {
  readonly body: string;
  readonly createdAt: string;
  readonly href?: string;
  readonly id: string;
  readonly readAt?: string;
  readonly title: string;
  readonly type: string;
}

interface WorkspaceDetailResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly version: number;
}

interface WorkspaceMemberResponse {
  readonly createdAt: string;
  readonly id: string;
  readonly role: { readonly code: string };
  readonly status: string;
  readonly user: { readonly displayEmail: string; readonly id: string };
  readonly version: number;
}

interface WorkspaceInvitationResponse {
  readonly createdAt: string;
  readonly emailNormalized: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly role: { readonly code: string };
  readonly status: string;
}

const mainNavigation: readonly NavigationItem[] = [
  { href: "/dashboard", icon: "dashboard", label: "概览" },
  { href: "/projects", icon: "projects", label: "项目" },
  { href: "/workspaces", icon: "workspaces", label: "工作区" },
  { href: "/notifications", icon: "notifications", label: "通知" },
  { href: "/usage", icon: "usage", label: "用量" },
  { href: "/team", icon: "team", label: "团队" },
  { href: "/settings", icon: "settings", label: "设置" },
];

export function App() {
  const [session, setSession] = useState<SessionView>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void api
      .getSession()
      .then(setSession)
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
            <Navigate replace to="/dashboard" />
          ) : (
            <Login onLogin={setSession} />
          )
        }
      />
      <Route
        path="/*"
        element={
          session ? (
            <AuthenticatedApp session={session} />
          ) : (
            <Navigate replace to="/login" />
          )
        }
      />
    </Routes>
  );
}

function Login({
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
      busy={busy}
      error={error}
      onRequestCode={(email) =>
        perform(async () => {
          await api.request("/auth/email-code-requests", {
            body: JSON.stringify({ audience: "user", email }),
            method: "POST",
          });
        })
      }
      onVerifyCode={async (email, code) => {
        await perform(async () => {
          const next = await api.request<SessionView>(
            "/auth/email-code-verifications",
            {
              body: JSON.stringify({ audience: "user", code, email }),
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

function AuthenticatedApp({ session }: { readonly session: SessionView }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceResponse[]>(
    [],
  );
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [activeProject, setActiveProject] = useState<ProjectResponse>();
  const applyWorkspaces = useCallback(
    (result: readonly WorkspaceResponse[]) => {
      setWorkspaces(result);
      const stored = globalThis.localStorage?.getItem("yingchuan.workspace-id");
      const selected = result.some((item) => item.id === stored)
        ? stored!
        : result[0]?.id;
      setWorkspaceId(selected);
      api.selectWorkspace(selected);
    },
    [],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.request<readonly WorkspaceResponse[]>(
        "/workspaces",
        {},
        { cache: true },
      );
      applyWorkspaces(result);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [applyWorkspaces]);
  useEffect(() => {
    let active = true;
    void api
      .request<readonly WorkspaceResponse[]>("/workspaces", {}, { cache: true })
      .then((result) => {
        if (active) applyWorkspaces(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFor(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyWorkspaces]);
  const selectWorkspace = (next: string) => {
    globalThis.localStorage?.setItem("yingchuan.workspace-id", next);
    api.selectWorkspace(next);
    setWorkspaceId(next);
    void navigate("/dashboard");
  };
  const shellWorkspaces = useMemo(
    () => workspaces.map(({ id, name }) => ({ id, name })),
    [workspaces],
  );
  const pathProjectId = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const projectItems =
    pathProjectId && pathProjectId !== "new"
      ? projectNavigation(pathProjectId, {
          website: activeProject?.capabilities.some(
            (item) => item.code === "website" && item.enabled,
          ),
        })
      : [];
  return (
    <AppShell
      accountHref="/settings"
      activeHref={location.pathname}
      navigation={mainNavigation}
      onLogout={() => {
        void api.request("/auth/logout", { method: "POST" }).finally(() => {
          api.setSession(undefined);
          globalThis.location.href = "/login";
        });
      }}
      onWorkspaceChange={selectWorkspace}
      projectNavigation={projectItems}
      projectTitle={activeProject?.name}
      userEmail={session.email}
      workspaceId={workspaceId}
      workspaces={shellWorkspaces}
    >
      <Routes>
        <Route path="/" element={<Navigate replace to="/dashboard" />} />
        <Route
          path="/dashboard"
          element={
            <Dashboard
              error={error}
              loading={loading}
              workspaceId={workspaceId}
              workspaces={workspaces}
            />
          }
        />
        <Route
          path="/projects"
          element={<ProjectsPage workspaceId={workspaceId} />}
        />
        <Route
          path="/projects/new"
          element={<NewProjectPage workspaceId={workspaceId} />}
        />
        <Route
          path="/projects/:projectId/onboarding"
          element={<ProjectOnboarding onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/overview"
          element={<ProjectOverview onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/brand"
          element={<ProjectBrand onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/sources"
          element={<ProjectSources onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/website"
          element={<ProjectWebsite onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/prompts"
          element={<ProjectPrompts onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/reports"
          element={<ProjectAnalysis onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/analysis/new"
          element={<ProjectAnalysis onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/reports/:reportId"
          element={<ProjectReportDetail onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/history"
          element={<ProjectHistory onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/optimization"
          element={<ProjectOptimization onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/settings"
          element={<ProjectSettings onProject={setActiveProject} />}
        />
        <Route
          path="/projects/:projectId/competitors"
          element={<ProjectCompetitors onProject={setActiveProject} />}
        />
        <Route path="/analysis-jobs/:jobId" element={<AnalysisJobDetail />} />
        <Route
          path="/projects/:projectId"
          element={<ProjectOverview onProject={setActiveProject} />}
        />
        <Route
          path="/workspaces"
          element={
            <WorkspacePage
              error={error}
              loading={loading}
              reload={load}
              workspaces={workspaces}
            />
          }
        />
        <Route
          path="/usage"
          element={<UsagePage workspaceId={workspaceId} />}
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/team" element={<TeamPage workspaceId={workspaceId} />} />
        <Route
          path="/settings"
          element={<SettingsPage workspaceId={workspaceId} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

function Dashboard({
  error,
  loading,
  workspaceId,
  workspaces,
}: {
  readonly error?: string;
  readonly loading: boolean;
  readonly workspaceId?: string;
  readonly workspaces: readonly WorkspaceResponse[];
}) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<readonly ProjectResponse[]>();
  const [notifications, setNotifications] =
    useState<readonly NotificationResponse[]>();
  const [dashboardError, setDashboardError] = useState<string>();
  useEffect(() => {
    let active = true;
    const timer = globalThis.setTimeout(() => {
      if (!workspaceId) {
        setProjects(undefined);
        setNotifications(undefined);
        return;
      }
      setProjects(undefined);
      setNotifications(undefined);
      void Promise.all([
        api.request<readonly ProjectResponse[]>(
          `/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
          {},
          { cache: false },
        ),
        api.request<readonly NotificationResponse[]>(
          "/notifications",
          {},
          { cache: false },
        ),
      ])
        .then(([nextProjects, nextNotifications]) => {
          if (!active) return;
          setProjects(nextProjects);
          setNotifications(nextNotifications);
          setDashboardError(undefined);
        })
        .catch((caught: unknown) => {
          if (active) setDashboardError(messageFor(caught));
        });
    }, 0);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
    };
  }, [workspaceId]);
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => (globalThis.location.href = "/projects/new")}>
            创建项目
          </Button>
        }
        description="查看品牌项目、分析进展和需要处理的事项。"
        title="工作台"
      />
      {loading || (workspaceId && (!projects || !notifications)) ? (
        <Skeleton lines={4} />
      ) : error || dashboardError ? (
        <StatePanel
          description={error ?? dashboardError ?? "工作台数据暂时不可用。"}
          title="暂时无法加载工作台"
          tone="error"
        />
      ) : workspaces.length === 0 ? (
        <StatePanel
          action={
            <Button onClick={() => (globalThis.location.href = "/workspaces")}>
              创建工作区
            </Button>
          }
          description="先创建工作区，再邀请团队成员并建立第一个品牌项目。"
          title="从工作区开始"
        />
      ) : projects?.length ? (
        <>
          <div className="yc-metric-grid">
            <article>
              <strong>{projects.length}</strong>
              <span>品牌项目</span>
            </article>
            <article>
              <strong>
                {
                  projects.filter((project) => project.status === "active")
                    .length
                }
              </strong>
              <span>活跃项目</span>
            </article>
            <article>
              <strong>
                {notifications?.filter((item) => !item.readAt).length ?? 0}
              </strong>
              <span>未读通知</span>
            </article>
            <article>
              <strong>
                {projects.reduce(
                  (total, project) => total + project.knowledgeSources.length,
                  0,
                )}
              </strong>
              <span>认知源</span>
            </article>
          </div>
          <section className="yc-card yc-section-card">
            <div className="yc-section-heading">
              <div>
                <h2>最近项目</h2>
                <p>继续品牌确认、认知源维护或分析任务。</p>
              </div>
              <Button intent="ghost" onClick={() => navigate("/projects")}>
                查看全部
              </Button>
            </div>
            <ul className="yc-plain-list">
              {projects.slice(0, 5).map((project) => (
                <li key={project.id}>
                  <span>
                    <strong>{project.name}</strong>
                    <small>
                      {project.brandEntity?.canonicalName ?? "品牌待确认"} ·{" "}
                      {project.knowledgeSources.length} 个认知源
                    </small>
                  </span>
                  <Button
                    intent="ghost"
                    onClick={() =>
                      navigate(
                        ["identifying", "waiting_confirmation"].includes(
                          project.status,
                        )
                          ? `/projects/${project.id}/onboarding`
                          : `/projects/${project.id}/overview`,
                      )
                    }
                  >
                    继续
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <StatePanel
          action={
            <Button
              onClick={() => (globalThis.location.href = "/projects/new")}
            >
              创建第一个项目
            </Button>
          }
          description={`当前工作区 ${workspaceId ?? "未选择"}的项目数据与权限已隔离。`}
          title="建立或继续品牌项目"
        />
      )}
    </>
  );
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<readonly NotificationResponse[]>();
  const [error, setError] = useState<string>();
  const load = async () => {
    try {
      setRows(
        await api.request<readonly NotificationResponse[]>(
          "/notifications",
          {},
          { cache: false },
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
  const open = async (item: NotificationResponse) => {
    try {
      if (!item.readAt)
        await api.request(`/notifications/${item.id}/read`, {
          method: "PATCH",
        });
      if (item.href) void navigate(item.href);
      else await load();
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  return (
    <>
      <PageHeader
        title="通知"
        description="分析报告和需要处理的业务事项会显示在这里。"
      />
      {error ? (
        <StatePanel description={error} title="无法加载通知" tone="error" />
      ) : !rows ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <StatePanel
          description="新报告生成后会在这里通知你。"
          title="暂无通知"
        />
      ) : (
        <ul className="yc-plain-list">
          {rows.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.readAt ? item.title : `● ${item.title}`}</strong>
                <small>
                  {item.body} ·{" "}
                  {new Date(item.createdAt).toLocaleString("zh-CN")}
                </small>
              </span>
              <Button intent="ghost" onClick={() => void open(item)}>
                {item.href ? "查看" : "已读"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TeamPage({ workspaceId }: { readonly workspaceId?: string }) {
  const [members, setMembers] = useState<readonly WorkspaceMemberResponse[]>();
  const [invitations, setInvitations] =
    useState<readonly WorkspaceInvitationResponse[]>();
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const nextMembers = await api.request<readonly WorkspaceMemberResponse[]>(
        `/workspaces/${workspaceId}/members`,
        {},
        { cache: false },
      );
      setMembers(nextMembers);
      try {
        setInvitations(
          await api.request<readonly WorkspaceInvitationResponse[]>(
            `/workspaces/${workspaceId}/invitations`,
            {},
            { cache: false },
          ),
        );
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 403)
          setInvitations([]);
        else throw caught;
      }
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [workspaceId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
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
  if (!workspaceId)
    return (
      <StatePanel
        description="请先创建或选择工作区，再管理团队成员。"
        title="尚未选择工作区"
      />
    );
  return (
    <>
      <PageHeader
        description="成员权限由服务端校验；角色调整和移除都会写入审计日志。"
        title="团队与权限"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      <div className="yc-content-grid">
        <section>
          {!members ? (
            <Skeleton lines={5} />
          ) : (
            <ResponsiveData
              columns={[
                {
                  key: "member",
                  label: "成员",
                  render: (row: WorkspaceMemberResponse) =>
                    row.user.displayEmail,
                },
                {
                  key: "role",
                  label: "角色",
                  render: (row: WorkspaceMemberResponse) => (
                    <select
                      aria-label={`调整 ${row.user.displayEmail} 的角色`}
                      disabled={busy}
                      onChange={(event) => {
                        const nextRole = event.target.value;
                        if (
                          globalThis.confirm(
                            `确认将 ${row.user.displayEmail} 的角色改为 ${nextRole}？`,
                          )
                        )
                          void execute(() =>
                            api.request(
                              `/workspaces/${workspaceId}/members/${row.id}`,
                              {
                                body: JSON.stringify({
                                  roleCode: nextRole,
                                  version: row.version,
                                }),
                                method: "PATCH",
                              },
                            ),
                          );
                      }}
                      value={row.role.code}
                    >
                      <option value="owner">所有者</option>
                      <option value="admin">管理员</option>
                      <option value="analyst">分析师</option>
                      <option value="operator">运营</option>
                      <option value="viewer">只读</option>
                    </select>
                  ),
                },
                {
                  key: "joined",
                  label: "加入时间",
                  render: (row: WorkspaceMemberResponse) =>
                    new Date(row.createdAt).toLocaleString("zh-CN"),
                  secondary: true,
                },
                {
                  key: "action",
                  label: "操作",
                  render: (row: WorkspaceMemberResponse) => (
                    <Button
                      disabled={busy}
                      intent="danger"
                      onClick={() => {
                        if (
                          globalThis.confirm(
                            `确认从工作区移除 ${row.user.displayEmail}？对方将立即失去访问权限。`,
                          )
                        )
                          void execute(() =>
                            api.request(
                              `/workspaces/${workspaceId}/members/${row.id}`,
                              { method: "DELETE" },
                            ),
                          );
                      }}
                    >
                      移除
                    </Button>
                  ),
                },
              ]}
              rows={members}
            />
          )}
        </section>
        <section className="yc-card yc-section-card">
          <h2>邀请成员</h2>
          <FormField hint="邀请链接通过邮件发送，7 天内有效。" label="邮箱">
            <input
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </FormField>
          <FormField label="初始角色">
            <select
              onChange={(event) => setRoleCode(event.target.value)}
              value={roleCode}
            >
              <option value="admin">管理员</option>
              <option value="analyst">分析师</option>
              <option value="operator">运营</option>
              <option value="viewer">只读</option>
            </select>
          </FormField>
          <Button
            disabled={busy || !email.trim()}
            onClick={() =>
              void execute(async () => {
                await api.request(`/workspaces/${workspaceId}/invitations`, {
                  body: JSON.stringify({ email: email.trim(), roleCode }),
                  method: "POST",
                });
                setEmail("");
              })
            }
          >
            {busy ? "处理中…" : "发送邀请"}
          </Button>
          <h3>待处理邀请</h3>
          {!invitations ? (
            <Skeleton lines={2} />
          ) : invitations.length ? (
            <ul className="yc-plain-list">
              {invitations.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>{item.emailNormalized}</strong>
                    <small>
                      {item.role.code} ·{" "}
                      {new Date(item.expiresAt).toLocaleString("zh-CN")} 到期
                    </small>
                  </span>
                  <StatusBadge
                    tone={item.status === "active" ? "success" : "neutral"}
                  >
                    {item.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="yc-meta">暂无待处理邀请。</p>
          )}
        </section>
      </div>
    </>
  );
}

function SettingsPage({ workspaceId }: { readonly workspaceId?: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceDetailResponse>();
  const [name, setName] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const next = await api.request<WorkspaceDetailResponse>(
        `/workspaces/${workspaceId}`,
        {},
        { cache: false },
      );
      setWorkspace(next);
      setName(next.name);
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [workspaceId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
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
  return (
    <>
      <PageHeader
        description="维护当前工作区名称，或使用邀请令牌加入另一个工作区。"
        title="设置"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      <div className="yc-content-grid">
        <section className="yc-card yc-section-card">
          <h2>工作区信息</h2>
          {!workspaceId ? (
            <p className="yc-meta">尚未选择工作区。</p>
          ) : !workspace ? (
            <Skeleton lines={3} />
          ) : (
            <>
              <FormField label="工作区名称">
                <input
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </FormField>
              <p className="yc-meta">标识：{workspace.slug}</p>
              <Button
                disabled={
                  busy || !name.trim() || name.trim() === workspace.name
                }
                onClick={() =>
                  void execute(() =>
                    api.request(`/workspaces/${workspace.id}`, {
                      body: JSON.stringify({
                        name: name.trim(),
                        version: workspace.version,
                      }),
                      method: "PATCH",
                    }),
                  )
                }
              >
                保存更改
              </Button>
            </>
          )}
        </section>
        <section className="yc-card yc-section-card">
          <h2>接受工作区邀请</h2>
          <FormField
            hint="邀请令牌来自映川发送的工作区邀请邮件。"
            label="邀请令牌"
          >
            <input
              autoComplete="off"
              onChange={(event) => setInvitationToken(event.target.value)}
              value={invitationToken}
            />
          </FormField>
          <Button
            disabled={busy || invitationToken.trim().length < 32}
            onClick={() =>
              void execute(async () => {
                const invitation = invitationToken.trim();
                await api.request("/workspace-invitations/accept-actions", {
                  body: JSON.stringify({ token: invitation }),
                  method: "POST",
                });
                setInvitationToken("");
                globalThis.location.href = "/workspaces";
              })
            }
          >
            接受邀请
          </Button>
        </section>
      </div>
    </>
  );
}

function WorkspacePage({
  error,
  loading,
  reload,
  workspaces,
}: {
  readonly error?: string;
  readonly loading: boolean;
  readonly reload: () => Promise<void>;
  readonly workspaces: readonly WorkspaceResponse[];
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.request("/workspaces", {
        body: JSON.stringify({ name: name.trim() }),
        method: "POST",
      });
      setName("");
      await reload();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader
        description="工作区是成员权限和品牌数据的隔离边界。"
        title="工作区"
      />
      {loading ? (
        <Skeleton />
      ) : error ? (
        <StatePanel description={error} title="无法加载工作区" tone="error" />
      ) : (
        <div className="yc-content-grid">
          <section className="yc-card yc-section-card">
            <h2>我的工作区</h2>
            {workspaces.length ? (
              <ul className="yc-plain-list">
                {workspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>
                        {workspace.memberships[0]?.role.code ?? "member"}
                      </small>
                    </span>
                    <span className="yc-meta">{workspace.slug}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="yc-meta">暂无工作区</p>
            )}
          </section>
          <section className="yc-card yc-section-card">
            <h2>创建工作区</h2>
            <label className="yc-form-field">
              <span>工作区名称</span>
              <input
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <Button
              disabled={saving || !name.trim()}
              onClick={() => void create()}
            >
              {saving ? "创建中…" : "创建"}
            </Button>
          </section>
        </div>
      )}
    </>
  );
}

function ProjectsPage({ workspaceId }: { readonly workspaceId?: string }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<readonly ProjectResponse[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    void api
      .request<readonly ProjectResponse[]>(
        `/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
      )
      .then((result) => active && setProjects(result))
      .catch((caught: unknown) => active && setError(messageFor(caught)))
      .finally(() => active && setLoadedWorkspaceId(workspaceId));
    return () => {
      active = false;
    };
  }, [workspaceId]);
  const loading = Boolean(workspaceId && loadedWorkspaceId !== workspaceId);
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => navigate("/projects/new")}>创建项目</Button>
        }
        description="每个项目拥有独立的品牌实体、认知源、分析与报告历史。"
        title="品牌项目"
      />
      {!workspaceId ? (
        <StatePanel
          description="请先创建或选择工作区。"
          title="尚未选择工作区"
        />
      ) : loading ? (
        <Skeleton lines={5} />
      ) : error ? (
        <StatePanel description={error} title="无法加载项目" tone="error" />
      ) : projects.length === 0 ? (
        <StatePanel
          action={
            <Button onClick={() => navigate("/projects/new")}>
              创建第一个项目
            </Button>
          }
          description="只需品牌名称；官网、地域和语言可以按实际情况补充。"
          title="暂无项目"
        />
      ) : (
        <ResponsiveData
          columns={[
            {
              key: "name",
              label: "项目",
              render: (row) => <strong>{row.name}</strong>,
            },
            {
              key: "status",
              label: "状态",
              render: (row) => <ProjectStatus status={row.status} />,
            },
            {
              key: "brand",
              label: "确认品牌",
              render: (row) => row.brandEntity?.canonicalName ?? "待确认",
              secondary: true,
            },
            {
              key: "action",
              label: "操作",
              render: (row) => (
                <Button
                  intent="ghost"
                  onClick={() =>
                    navigate(
                      row.status === "identifying" ||
                        row.status === "waiting_confirmation"
                        ? `/projects/${row.id}/onboarding`
                        : `/projects/${row.id}/overview`,
                    )
                  }
                >
                  打开
                </Button>
              ),
            },
          ]}
          rows={projects}
        />
      )}
    </>
  );
}

function NewProjectPage({ workspaceId }: { readonly workspaceId?: string }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [country, setCountry] = useState("CN");
  const [language, setLanguage] = useState("zh-CN");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const create = async () => {
    if (!workspaceId || !name.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      const project = await api.request<ProjectResponse>("/projects", {
        body: JSON.stringify({
          defaultCountry: country,
          defaultLanguage: language,
          name: name.trim(),
          timezone,
          websiteUrl: websiteUrl.trim() || undefined,
          workspaceId,
        }),
        headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
        method: "POST",
      });
      void navigate(`/projects/${project.id}/onboarding`);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  };
  if (!workspaceId)
    return (
      <StatePanel description="创建项目前请先选择工作区。" title="缺少工作区" />
    );
  return (
    <>
      <PageHeader
        description="品牌名称是唯一必填项；信息不足时系统会保留草稿并让你人工确认。"
        title="创建品牌项目"
      />
      <section className="yc-card yc-section-card yc-form-card">
        <FormField label="项目/品牌名称">
          <input
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </FormField>
        <FormField
          hint="建议填写官方站点；系统只会抓取你确认过的公开网址。"
          label="官网（可选）"
        >
          <input
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="https://example.com"
            type="url"
            value={websiteUrl}
          />
        </FormField>
        <div className="yc-form-row">
          <FormField label="国家/地区代码">
            <input
              maxLength={2}
              onChange={(event) => setCountry(event.target.value.toUpperCase())}
              value={country}
            />
          </FormField>
          <FormField label="主要语言">
            <input
              onChange={(event) => setLanguage(event.target.value)}
              value={language}
            />
          </FormField>
          <FormField label="时区">
            <input
              onChange={(event) => setTimezone(event.target.value)}
              value={timezone}
            />
          </FormField>
        </div>
        {error && (
          <p className="yc-inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="yc-actions">
          <Button intent="secondary" onClick={() => navigate("/projects")}>
            取消
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={() => void create()}
          >
            {saving ? "创建中…" : "创建并识别"}
          </Button>
        </div>
      </section>
    </>
  );
}

function ProjectOnboarding({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error, reload } = useProject(onProject, true);
  const [saving, setSaving] = useState(false);
  const confirm = async (candidateId: string) => {
    if (!project) return;
    setSaving(true);
    try {
      const confirmed = await api.request<ProjectResponse>(
        `/projects/${project.id}/identification-confirmations`,
        { body: JSON.stringify({ candidateId }), method: "POST" },
      );
      onProject(confirmed);
      void navigate(`/projects/${confirmed.id}/overview`);
    } finally {
      setSaving(false);
    }
  };
  if (loading && !project) return <Skeleton lines={5} />;
  if (error || !project)
    return (
      <StatePanel
        description={error ?? "项目不存在。"}
        title="无法加载识别结果"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <Button intent="secondary" onClick={() => void reload()}>
            刷新状态
          </Button>
        }
        description="系统只把候选交给你确认，不会自动把同名品牌合并。"
        metadata={`状态：${project.onboardingStatus}`}
        title={project.name}
      />
      {project.status === "identifying" ? (
        <StatePanel
          description="识别任务正在后台运行。即使任务失败，当前输入也会作为草稿保留。"
          title="正在识别品牌"
          tone="stale"
        />
      ) : project.status === "draft" ? (
        <StatePanel
          action={<Button onClick={() => void reload()}>重新查看</Button>}
          description="自动识别未完成。你仍可返回项目列表，后续使用人工候选继续确认。"
          title="已保存为草稿"
          tone="error"
        />
      ) : (
        <section className="yc-card yc-section-card">
          <h2>确认品牌候选</h2>
          <ul className="yc-plain-list">
            {project.brandCandidates
              .filter((candidate) => candidate.status === "pending")
              .map((candidate) => (
                <li key={candidate.id}>
                  <span>
                    <strong>{candidate.displayName}</strong>
                    <small>{candidate.officialWebsite ?? "未提供官网"}</small>
                  </span>
                  <Button
                    disabled={saving}
                    onClick={() => void confirm(candidate.id)}
                  >
                    确认此品牌
                  </Button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ProjectOverview({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error } = useProject(onProject);
  if (loading) return <Skeleton lines={5} />;
  if (error || !project)
    return (
      <StatePanel
        description={error ?? "项目不存在。"}
        title="无法加载项目"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => navigate(`/projects/${project.id}/sources`)}>
            管理认知源
          </Button>
        }
        description="品牌身份与数据源已冻结到当前项目边界。"
        title={project.name}
      />
      <div className="yc-content-grid">
        <section className="yc-card yc-section-card">
          <h2>品牌身份</h2>
          <p>
            <strong>{project.brandEntity?.canonicalName ?? "待确认"}</strong>
          </p>
          <ProjectStatus status={project.status} />
        </section>
        <section className="yc-card yc-section-card">
          <h2>认知源</h2>
          <p>{project.knowledgeSources.length} 个来源</p>
          <p className="yc-meta">仅已确认来源可进入抓取队列。</p>
        </section>
      </div>
    </>
  );
}

function ProjectBrand({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error } = useProject(onProject);
  if (loading) return <Skeleton lines={5} />;
  if (error || !project)
    return (
      <StatePanel
        description={error ?? "项目不存在。"}
        title="无法加载品牌信息"
        tone="error"
      />
    );
  const brand = project.brandEntity;
  return (
    <>
      <PageHeader
        actions={
          <Button
            intent="secondary"
            onClick={() => navigate(`/projects/${project.id}/sources`)}
          >
            管理认知源
          </Button>
        }
        description="这里展示当前已确认的品牌身份；系统不会用同名候选自动覆盖人工确认。"
        title="品牌信息"
      />
      {!brand ? (
        <StatePanel
          action={
            <Button
              onClick={() => navigate(`/projects/${project.id}/onboarding`)}
            >
              完成品牌确认
            </Button>
          }
          description="确认品牌候选后，规范名称、官网、国家和主要语言会显示在这里。"
          title="品牌尚未确认"
        />
      ) : (
        <div className="yc-content-grid">
          <section className="yc-card yc-section-card">
            <h2>{brand.canonicalName}</h2>
            <dl className="yc-definition-list">
              <div>
                <dt>规范名称</dt>
                <dd>{brand.canonicalName}</dd>
              </div>
              <div>
                <dt>官网</dt>
                <dd>{brand.officialWebsite ?? "未设置"}</dd>
              </div>
              <div>
                <dt>国家/地区</dt>
                <dd>{brand.country ?? "未设置"}</dd>
              </div>
              <div>
                <dt>主要语言</dt>
                <dd>{brand.primaryLanguage ?? "未设置"}</dd>
              </div>
            </dl>
          </section>
          <section className="yc-card yc-section-card">
            <h2>品牌认知状态</h2>
            <ProjectStatus status={project.status} />
            <p className="yc-meta">
              已关联 {project.knowledgeSources.length}{" "}
              个认知源。品牌事实的修订以来源和人工确认记录为依据。
            </p>
          </section>
        </div>
      )}
    </>
  );
}

function ProjectWebsite({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error } = useProject(onProject);
  if (loading) return <Skeleton lines={5} />;
  if (error || !project)
    return (
      <StatePanel
        description={error ?? "项目不存在。"}
        title="无法加载官网信息"
        tone="error"
      />
    );
  const websiteSources = project.knowledgeSources.filter(
    (source) => source.type === "official_website",
  );
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => navigate(`/projects/${project.id}/sources`)}>
            管理官网来源
          </Button>
        }
        description="官网内容只有在人工确认并通过安全抓取后，才会进入品牌认知基线。"
        title="官网"
      />
      {websiteSources.length ? (
        <ResponsiveData
          columns={[
            {
              key: "url",
              label: "官网地址",
              render: (row: KnowledgeSource) => row.originalUrl,
            },
            {
              key: "status",
              label: "状态",
              render: (row: KnowledgeSource) => (
                <ProjectStatus status={row.status} />
              ),
            },
            {
              key: "lastFetched",
              label: "最近成功抓取",
              render: (row: KnowledgeSource) =>
                row.lastSuccessfulFetchedAt
                  ? new Date(row.lastSuccessfulFetchedAt).toLocaleString(
                      "zh-CN",
                    )
                  : "尚未成功抓取",
              secondary: true,
            },
          ]}
          rows={websiteSources}
        />
      ) : (
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/sources`)}>
              添加官网来源
            </Button>
          }
          description="当前项目尚未确认官方站点。添加后仍需人工确认，系统不会自动抓取未知候选。"
          title="尚未配置官网"
        />
      )}
    </>
  );
}

function ProjectSources({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const { project, loading, error, reload } = useProject(onProject);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("other");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const add = async () => {
    if (!project || !url.trim()) return;
    setBusy(true);
    setActionError(undefined);
    try {
      await api.request(`/projects/${project.id}/sources`, {
        body: JSON.stringify({ type, url: url.trim() }),
        method: "POST",
      });
      setUrl("");
      await reload();
    } catch (caught) {
      setActionError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  const fetchSource = async (sourceId: string) => {
    if (!project) return;
    setBusy(true);
    try {
      await api.request(
        `/projects/${project.id}/sources/${sourceId}/fetch-actions`,
        {
          headers: { "Idempotency-Key": globalThis.crypto.randomUUID() },
          method: "POST",
        },
      );
      await reload();
    } catch (caught) {
      setActionError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Skeleton lines={5} />;
  if (error || !project)
    return (
      <StatePanel
        description={error ?? "项目不存在。"}
        title="无法加载认知源"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        description="所有抓取均经过地址、DNS、重定向、类型、大小与超时检查。"
        title="认知源"
      />
      <div className="yc-content-grid">
        <section>
          {project.knowledgeSources.length ? (
            <ResponsiveData
              columns={[
                {
                  key: "url",
                  label: "来源",
                  render: (row) => <span>{row.originalUrl}</span>,
                },
                {
                  key: "type",
                  label: "类型",
                  render: (row) => row.type,
                  secondary: true,
                },
                {
                  key: "status",
                  label: "状态",
                  render: (row) => <ProjectStatus status={row.status} />,
                },
                {
                  key: "action",
                  label: "抓取",
                  render: (row) => (
                    <Button
                      disabled={busy || row.status !== "confirmed"}
                      intent="ghost"
                      onClick={() => void fetchSource(row.id)}
                    >
                      立即抓取
                    </Button>
                  ),
                },
              ]}
              rows={project.knowledgeSources}
            />
          ) : (
            <StatePanel
              description="添加公开页面并明确确认后，才会进入安全抓取队列。"
              title="暂无认知源"
            />
          )}
        </section>
        <section className="yc-card yc-section-card">
          <h2>添加来源</h2>
          <FormField label="来源类型">
            <select
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              <option value="official_website">官方网站</option>
              <option value="official_social">官方社交账号</option>
              <option value="public_profile">公开资料页</option>
              <option value="other">其他</option>
            </select>
          </FormField>
          <FormField label="公开网址">
            <input
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              type="url"
              value={url}
            />
          </FormField>
          {actionError && (
            <p className="yc-inline-error" role="alert">
              {actionError}
            </p>
          )}
          <Button disabled={busy || !url.trim()} onClick={() => void add()}>
            {busy ? "处理中…" : "确认并添加"}
          </Button>
        </section>
      </div>
    </>
  );
}

function ProjectPrompts({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const {
    project,
    loading: projectLoading,
    error: projectError,
  } = useProject(onProject);
  const [prompts, setPrompts] = useState<readonly PromptResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("recommendation");
  const [scope, setScope] = useState("global");
  const [country, setCountry] = useState("CN");
  const [city, setCity] = useState("");
  const [groupKey, setGroupKey] = useState("");
  const [requiresWebSearch, setRequiresWebSearch] = useState(false);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<
    readonly { versionNumber: number; text: string }[]
  >([]);
  const promptProjectId = project?.id;
  const reload = useCallback(async () => {
    if (!promptProjectId) return;
    try {
      setPrompts(
        await api.request<readonly PromptResponse[]>(
          `/projects/${promptProjectId}/prompts`,
        ),
      );
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoaded(true);
    }
  }, [promptProjectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void reload(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [reload]);
  const execute = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await operation();
      await reload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  const promptPayload = (prompt: PromptResponse) => ({
    category: prompt.category,
    city: prompt.city,
    country: prompt.country,
    district: prompt.district,
    enabled: prompt.enabled,
    groupKey: prompt.groupKey,
    language: prompt.language,
    nearbyLandmark: prompt.nearbyLandmark,
    priority: prompt.priority,
    province: prompt.province,
    requiresWebSearch: prompt.requiresWebSearch,
    scope: prompt.scope,
    targetStoreId: prompt.targetStoreId,
    text: prompt.text,
  });
  if (projectLoading || !loaded) return <Skeleton lines={6} />;
  if (projectError || !project)
    return (
      <StatePanel
        description={projectError ?? "项目不存在。"}
        title="无法加载 Prompt"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <Button
            disabled={busy}
            onClick={() =>
              void execute(() =>
                api.request(`/projects/${project.id}/prompt-generation-jobs`, {
                  body: JSON.stringify({ count: 6 }),
                  method: "POST",
                }),
              )
            }
          >
            生成建议 Prompt
          </Button>
        }
        description="Prompt 按分类、地域 Scope 和版本保存；编辑不会覆盖历史分析输入。"
        title="Prompt"
      />
      <AnalysisEstimatePanel projectId={project.id} />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      <div className="yc-content-grid">
        <section>
          {prompts.length ? (
            <ResponsiveData
              columns={[
                {
                  key: "text",
                  label: "问题",
                  render: (row) => (
                    <span>
                      <strong>{row.text}</strong>
                      <small className="yc-block-meta">
                        {row.groupKey ?? "未分组"} · v{row.version}
                      </small>
                    </span>
                  ),
                },
                {
                  key: "category",
                  label: "分类 / Scope",
                  render: (row) =>
                    `${row.category} / ${row.scope}${row.requiresWebSearch ? " / 需联网" : ""}`,
                  secondary: true,
                },
                {
                  key: "status",
                  label: "状态",
                  render: (row) => (
                    <StatusBadge tone={row.enabled ? "success" : "neutral"}>
                      {row.enabled ? "启用" : "停用"}
                    </StatusBadge>
                  ),
                },
                {
                  key: "actions",
                  label: "操作",
                  render: (row) => (
                    <div className="yc-inline-actions">
                      <Button
                        disabled={busy}
                        intent="ghost"
                        onClick={() =>
                          void execute(() =>
                            api.request(
                              `/projects/${project.id}/prompts/${row.id}`,
                              {
                                body: JSON.stringify({
                                  ...promptPayload(row),
                                  enabled: !row.enabled,
                                  version: row.version,
                                }),
                                method: "PATCH",
                              },
                            ),
                          )
                        }
                      >
                        {row.enabled ? "停用" : "启用"}
                      </Button>
                      <Button
                        disabled={busy}
                        intent="ghost"
                        onClick={() =>
                          void execute(() =>
                            api.request(
                              `/projects/${project.id}/prompts/${row.id}/variant-actions`,
                              {
                                body: JSON.stringify({ count: 2 }),
                                method: "POST",
                              },
                            ),
                          )
                        }
                      >
                        变体
                      </Button>
                      <Button
                        intent="ghost"
                        onClick={() =>
                          void api
                            .request<
                              readonly { versionNumber: number; text: string }[]
                            >(
                              `/projects/${project.id}/prompts/${row.id}/versions`,
                            )
                            .then(setHistory)
                            .catch((caught: unknown) =>
                              setError(messageFor(caught)),
                            )
                        }
                      >
                        历史
                      </Button>
                      <Button
                        disabled={busy}
                        intent="ghost"
                        onClick={() =>
                          void execute(() =>
                            api.request(
                              `/projects/${project.id}/prompts/${row.id}`,
                              { method: "DELETE" },
                            ),
                          )
                        }
                      >
                        删除
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={prompts}
            />
          ) : (
            <StatePanel
              description="生成一组建议，或手动添加贴近真实用户表达的问题。"
              title="暂无 Prompt"
            />
          )}
          {history.length > 0 && (
            <section className="yc-card yc-section-card yc-history-card">
              <h2>版本历史</h2>
              <ol>
                {history.map((item) => (
                  <li key={item.versionNumber}>
                    <strong>v{item.versionNumber}</strong> {item.text}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </section>
        <div className="yc-side-stack">
          <section className="yc-card yc-section-card">
            <h2>手动添加</h2>
            <FormField label="问题">
              <textarea
                onChange={(event) => setText(event.target.value)}
                rows={4}
                value={text}
              />
            </FormField>
            <div className="yc-form-row yc-form-row--two">
              <FormField label="分类">
                <select
                  onChange={(event) => setCategory(event.target.value)}
                  value={category}
                >
                  <option value="recommendation">推荐</option>
                  <option value="brand_awareness">品牌认知</option>
                  <option value="comparison">比较</option>
                  <option value="scenario">场景</option>
                  <option value="factual">事实</option>
                  <option value="trust">信任</option>
                </select>
              </FormField>
              <FormField label="Scope">
                <select
                  onChange={(event) => setScope(event.target.value)}
                  value={scope}
                >
                  <option value="global">全球</option>
                  <option value="country">国家</option>
                  <option value="city">城市</option>
                </select>
              </FormField>
            </div>
            {scope !== "global" && (
              <div className="yc-form-row yc-form-row--two">
                <FormField label="国家代码">
                  <input
                    onChange={(event) =>
                      setCountry(event.target.value.toUpperCase())
                    }
                    value={country}
                  />
                </FormField>
                {scope === "city" && (
                  <FormField label="城市">
                    <input
                      onChange={(event) => setCity(event.target.value)}
                      value={city}
                    />
                  </FormField>
                )}
              </div>
            )}
            <FormField label="分组（可选）">
              <input
                onChange={(event) => setGroupKey(event.target.value)}
                value={groupKey}
              />
            </FormField>
            <label className="yc-checkbox-row">
              <input
                checked={requiresWebSearch}
                onChange={(event) => setRequiresWebSearch(event.target.checked)}
                type="checkbox"
              />
              需要模型原生联网（不支持的模型将跳过）
            </label>
            <Button
              disabled={busy || !text.trim()}
              onClick={() =>
                void execute(async () => {
                  await api.request(`/projects/${project.id}/prompts`, {
                    body: JSON.stringify({
                      category,
                      city: scope === "city" ? city : undefined,
                      country: scope === "global" ? undefined : country,
                      groupKey: groupKey || undefined,
                      requiresWebSearch,
                      scope,
                      text,
                    }),
                    method: "POST",
                  });
                  setText("");
                })
              }
            >
              添加 Prompt
            </Button>
          </section>
          <section className="yc-card yc-section-card">
            <h2>批量导入</h2>
            <FormField hint="每行一个问题，最多 100 行。" label="问题列表">
              <textarea
                onChange={(event) => setImportText(event.target.value)}
                rows={5}
                value={importText}
              />
            </FormField>
            <Button
              disabled={busy || !importText.trim()}
              onClick={() =>
                void execute(async () => {
                  const entries = importText
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((item) => ({
                      category: "factual",
                      scope: "global",
                      text: item,
                    }));
                  await api.request(
                    `/projects/${project.id}/prompts/import-actions`,
                    {
                      body: JSON.stringify({ prompts: entries }),
                      method: "POST",
                    },
                  );
                  setImportText("");
                })
              }
            >
              导入
            </Button>
          </section>
        </div>
      </div>
    </>
  );
}

function AnalysisEstimatePanel({ projectId }: { readonly projectId: string }) {
  const [estimate, setEstimate] = useState<AnalysisEstimateResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setEstimate(
        await api.request<AnalysisEstimateResponse>(
          `/projects/${projectId}/analysis-estimates`,
          { method: "POST" },
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="yc-card yc-section-card">
      <div className="yc-section-heading">
        <div>
          <h2>分析估算</h2>
          <p>
            按当前启用
            Prompt、模型版本和价格计算，不支持所需原生联网的组合会跳过。
          </p>
        </div>
        <Button disabled={busy} intent="ghost" onClick={() => void load()}>
          {busy ? "计算中…" : "重新估算"}
        </Button>
      </div>
      {error && <p className="yc-form-field__error">{error}</p>}
      {estimate && (
        <div className="yc-metric-grid">
          <article>
            <strong>{estimate.eligibleRunCount}</strong>
            <span>可执行运行</span>
          </article>
          <article>
            <strong>{estimate.skippedRunCount}</strong>
            <span>不支持已跳过</span>
          </article>
          <article>
            <strong>{formatMicros(estimate.estimatedCostMicros)}</strong>
            <span>预估模型成本</span>
          </article>
        </div>
      )}
    </section>
  );
}

function ProjectAnalysis({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error: projectError } = useProject(onProject);
  const [jobs, setJobs] = useState<readonly AnalysisJobResponse[]>([]);
  const [selected, setSelected] = useState<AnalysisJobResponse>();
  const [score, setScore] = useState<VisibilityScoreResponse>();
  const [reports, setReports] = useState<readonly ReportVersionResponse[]>([]);
  const [report, setReport] = useState<ReportVersionResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const projectId = project?.id;
  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const result = await api.request<readonly AnalysisJobResponse[]>(
        `/projects/${projectId}/analysis-jobs`,
      );
      const scores = await api.request<readonly VisibilityScoreResponse[]>(
        `/projects/${projectId}/scores`,
        {},
        { cache: false },
      );
      const reportList = await api.request<readonly ReportVersionResponse[]>(
        `/projects/${projectId}/reports`,
        {},
        { cache: false },
      );
      setScore(scores[0]);
      setReports(reportList);
      if (reportList[0]) {
        setReport(
          await api.request<ReportVersionResponse>(
            `/projects/${projectId}/reports/${reportList[0].id}`,
            {},
            { cache: false },
          ),
        );
      } else setReport(undefined);
      setJobs(result);
      if (result[0]) {
        const detail = await api.request<AnalysisJobResponse>(
          `/analysis-jobs/${result[0].id}`,
          {},
          { cache: false },
        );
        setSelected(detail);
      }
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [projectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!selected || !["queued", "running"].includes(selected.status)) return;
    const timer = globalThis.setInterval(() => void load(), 2_000);
    return () => globalThis.clearInterval(timer);
  }, [load, selected]);
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
  if (loading) return <Skeleton lines={7} />;
  if (projectError || !project)
    return (
      <StatePanel
        description={projectError ?? "项目不存在。"}
        title="无法加载分析"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <Button
            disabled={busy}
            onClick={() =>
              void execute(() =>
                api.request(`/projects/${project.id}/analysis-jobs`, {
                  headers: {
                    "Idempotency-Key": globalThis.crypto.randomUUID(),
                  },
                  method: "POST",
                }),
              )
            }
          >
            {busy ? "提交中…" : "开始新分析"}
          </Button>
        }
        description="提交时冻结 Prompt、模型能力与价格；页面刷新后可从数据库恢复进度。"
        title="AI 可见度分析"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      <AnalysisEstimatePanel projectId={project.id} />
      {report && (
        <section className="yc-card yc-section-card">
          <div className="yc-section-heading">
            <div>
              <h2>{report.title}</h2>
              <p>
                版本 {report.versionNumber} ·{" "}
                {report.contentSnapshot.scoreVersion}
              </p>
            </div>
            <StatusBadge
              tone={report.status === "published" ? "success" : "neutral"}
            >
              {report.status}
            </StatusBadge>
          </div>
          {report.limitationSummary && (
            <StatePanel
              description={report.limitationSummary}
              title="阅读限制"
              tone="stale"
            />
          )}
          <div className="yc-metric-grid">
            <article>
              <strong>{report.contentSnapshot.overallScore.toFixed(1)}</strong>
              <span>总分</span>
            </article>
            <article>
              <strong>{report.contentSnapshot.confidence.toFixed(1)}</strong>
              <span>置信度</span>
            </article>
            <article>
              <strong>{report.contentSnapshot.successfulRuns}</strong>
              <span>有效样本</span>
            </article>
            <article>
              <strong>{report.contentSnapshot.failedRuns}</strong>
              <span>失败样本</span>
            </article>
          </div>
          <h3>基础优化建议</h3>
          {report.recommendations.length === 0 ? (
            <p className="yc-meta">当前没有低分维度建议。</p>
          ) : (
            <ul className="yc-plain-list">
              {report.recommendations.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>
                      {item.priority} · {item.title}
                    </strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="yc-meta">{item.effort}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="yc-actions">
            {report.status === "ready" && (
              <Button
                disabled={busy}
                onClick={() =>
                  void execute(() =>
                    api.request(
                      `/projects/${project.id}/reports/${report.id}/publish`,
                      { method: "POST" },
                    ),
                  )
                }
              >
                发布此版本
              </Button>
            )}
            {["ready", "published"].includes(report.status) && (
              <Button
                disabled={busy}
                intent="ghost"
                onClick={() =>
                  void execute(() =>
                    api.request(
                      `/projects/${project.id}/reports/${report.id}/archive`,
                      { method: "POST" },
                    ),
                  )
                }
              >
                归档
              </Button>
            )}
          </div>
        </section>
      )}
      {score && (
        <section className="yc-card yc-section-card">
          <div className="yc-section-heading">
            <div>
              <h2>{score.overallScore.toFixed(1)} / 100</h2>
              <p>
                {score.scoreVersion} · 置信度 {score.confidence.toFixed(1)} (
                {score.confidenceLevel})
              </p>
            </div>
            <StatusBadge tone={score.diagnosticOnly ? "warning" : "success"}>
              {score.diagnosticOnly ? "诊断结果" : "可发布趋势"}
            </StatusBadge>
          </div>
          <div className="yc-metric-grid">
            {score.dimensions.map((item) => (
              <article key={item.dimensionCode}>
                <strong>
                  {item.value === null || item.value === undefined
                    ? "N/A"
                    : Number(item.value).toFixed(1)}
                </strong>
                <span>{item.dimensionCode}</span>
              </article>
            ))}
          </div>
        </section>
      )}
      {!selected ? (
        <StatePanel
          description="确认估算和额度后发起第一次分析。"
          title="暂无分析任务"
        />
      ) : (
        <div className="yc-content-grid">
          <section className="yc-card yc-section-card">
            <div className="yc-section-heading">
              <div>
                <h2>最新任务</h2>
                <p>{new Date(selected.createdAt).toLocaleString("zh-CN")}</p>
              </div>
              <div className="yc-inline-actions">
                <StatusBadge tone={jobTone(selected.status)}>
                  {selected.status}
                </StatusBadge>
                <Button
                  intent="ghost"
                  onClick={() => navigate(`/analysis-jobs/${selected.id}`)}
                >
                  查看任务详情
                </Button>
              </div>
            </div>
            <div className="yc-metric-grid">
              <article>
                <strong>{selected.succeededRuns}</strong>
                <span>成功</span>
              </article>
              <article>
                <strong>{selected.runningRuns + selected.queuedRuns}</strong>
                <span>待处理</span>
              </article>
              <article>
                <strong>{selected.failedRuns}</strong>
                <span>失败/未知</span>
              </article>
              <article>
                <strong>{selected.cancelledRuns}</strong>
                <span>已取消</span>
              </article>
            </div>
            <div className="yc-actions">
              {["queued", "running"].includes(selected.status) && (
                <Button
                  disabled={busy}
                  intent="ghost"
                  onClick={() =>
                    void execute(() =>
                      api.request(
                        `/analysis-jobs/${selected.id}/cancellation`,
                        {
                          body: JSON.stringify({ reason: "用户在任务页取消" }),
                          method: "POST",
                        },
                      ),
                    )
                  }
                >
                  取消未执行运行
                </Button>
              )}
              {["failed", "partially_completed"].includes(selected.status) && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void execute(() =>
                      api.request(`/analysis-jobs/${selected.id}/retries`, {
                        method: "POST",
                      }),
                    )
                  }
                >
                  重试可恢复失败
                </Button>
              )}
            </div>
          </section>
          <section>
            {selected.runs?.length ? (
              <ResponsiveData
                columns={[
                  {
                    key: "model",
                    label: "模型",
                    render: (
                      row: NonNullable<AnalysisJobResponse["runs"]>[number],
                    ) => row.modelConfigVersion.modelConfig.displayName,
                  },
                  {
                    key: "prompt",
                    label: "Prompt",
                    render: (
                      row: NonNullable<AnalysisJobResponse["runs"]>[number],
                    ) => row.promptVersion.text,
                  },
                  {
                    key: "status",
                    label: "状态",
                    render: (
                      row: NonNullable<AnalysisJobResponse["runs"]>[number],
                    ) => (
                      <StatusBadge tone={jobTone(row.status)}>
                        {row.status}
                      </StatusBadge>
                    ),
                  },
                  {
                    key: "error",
                    label: "错误",
                    render: (
                      row: NonNullable<AnalysisJobResponse["runs"]>[number],
                    ) => row.errorCode ?? "—",
                    secondary: true,
                  },
                ]}
                rows={selected.runs}
              />
            ) : null}
          </section>
        </div>
      )}
      {(jobs.length > 1 || reports.length > 1) && (
        <p className="yc-block-meta">
          历史任务 {jobs.length} 个，报告版本 {reports.length}{" "}
          个；历史版本保持不可变。
        </p>
      )}
    </>
  );
}

function AnalysisJobDetail() {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [job, setJob] = useState<AnalysisJobResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      setJob(
        await api.request<AnalysisJobResponse>(
          `/analysis-jobs/${jobId}`,
          {},
          { cache: false },
        ),
      );
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [jobId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = globalThis.setInterval(() => void load(), 2_000);
    return () => globalThis.clearInterval(timer);
  }, [job, load]);
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
  if (!job && !error) return <Skeleton lines={7} />;
  if (error || !job)
    return (
      <StatePanel
        action={<Button onClick={() => navigate("/projects")}>返回项目</Button>}
        description={error ?? "任务不存在。"}
        title="无法加载分析任务"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <Button intent="secondary" onClick={() => navigate(-1)}>
            返回
          </Button>
        }
        description="任务状态以服务端记录为准；页面刷新或断线重连不会丢失进度。"
        metadata={`创建于 ${new Date(job.createdAt).toLocaleString("zh-CN")}`}
        title={`分析任务 ${job.id.slice(0, 8)}`}
      />
      <div className="yc-metric-grid">
        <article>
          <strong>{job.totalRuns}</strong>
          <span>总运行</span>
        </article>
        <article>
          <strong>{job.succeededRuns}</strong>
          <span>成功</span>
        </article>
        <article>
          <strong>{job.runningRuns + job.queuedRuns}</strong>
          <span>待处理</span>
        </article>
        <article>
          <strong>{job.failedRuns}</strong>
          <span>失败</span>
        </article>
      </div>
      <section className="yc-card yc-section-card">
        <div className="yc-section-heading">
          <div>
            <h2>运行状态</h2>
            <p>预估成本 {formatMicros(job.estimatedCostMicros)}</p>
          </div>
          <StatusBadge tone={jobTone(job.status)}>{job.status}</StatusBadge>
        </div>
        <div className="yc-actions">
          {["queued", "running"].includes(job.status) && (
            <Button
              disabled={busy}
              intent="danger"
              onClick={() => {
                if (globalThis.confirm("确认取消尚未执行的模型运行？"))
                  void execute(() =>
                    api.request(`/analysis-jobs/${job.id}/cancellation`, {
                      body: JSON.stringify({ reason: "用户在任务详情页取消" }),
                      method: "POST",
                    }),
                  );
              }}
            >
              取消未执行运行
            </Button>
          )}
          {["failed", "partially_completed"].includes(job.status) && (
            <Button
              disabled={busy}
              onClick={() =>
                void execute(() =>
                  api.request(`/analysis-jobs/${job.id}/retries`, {
                    method: "POST",
                  }),
                )
              }
            >
              重试可恢复失败
            </Button>
          )}
        </div>
      </section>
      {job.runs?.length ? (
        <ResponsiveData
          columns={[
            {
              key: "model",
              label: "模型",
              render: (row: NonNullable<AnalysisJobResponse["runs"]>[number]) =>
                row.modelConfigVersion.modelConfig.displayName,
            },
            {
              key: "prompt",
              label: "Prompt",
              render: (row: NonNullable<AnalysisJobResponse["runs"]>[number]) =>
                row.promptVersion.text,
            },
            {
              key: "status",
              label: "状态",
              render: (
                row: NonNullable<AnalysisJobResponse["runs"]>[number],
              ) => (
                <StatusBadge tone={jobTone(row.status)}>
                  {row.status}
                </StatusBadge>
              ),
            },
            {
              key: "error",
              label: "错误码",
              render: (row: NonNullable<AnalysisJobResponse["runs"]>[number]) =>
                row.errorCode ?? "—",
              secondary: true,
            },
          ]}
          rows={job.runs}
        />
      ) : (
        <StatePanel
          description="任务建立后，模型运行会在这里逐条显示。"
          title="暂无运行记录"
        />
      )}
    </>
  );
}

function ProjectHistory({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, error: projectError } = useProject(onProject);
  const [reports, setReports] = useState<readonly ReportVersionResponse[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!project?.id) return;
    void api
      .request<readonly ReportVersionResponse[]>(
        `/projects/${project.id}/reports`,
        {},
        { cache: false },
      )
      .then(setReports)
      .catch((caught) => setError(messageFor(caught)));
  }, [project?.id]);
  if (projectError || !project)
    return (
      <StatePanel
        description={projectError ?? "项目不存在。"}
        title="无法加载历史报告"
        tone="error"
      />
    );
  if (!reports && !error) return <Skeleton lines={6} />;
  const reportRows = reports ?? [];
  return (
    <>
      <PageHeader
        description="报告版本生成后保持不可变；不同评分版本默认不直接连成趋势。"
        title="历史报告"
      />
      {error ? (
        <StatePanel description={error} title="无法加载报告" tone="error" />
      ) : reportRows.length === 0 ? (
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/reports`)}>
              发起第一次分析
            </Button>
          }
          description="分析完成并生成报告后，版本记录会显示在这里。"
          title="暂无历史报告"
        />
      ) : (
        <ResponsiveData
          columns={[
            {
              key: "title",
              label: "报告",
              render: (row: ReportVersionResponse) => (
                <strong>{row.title}</strong>
              ),
            },
            {
              key: "version",
              label: "版本",
              render: (row: ReportVersionResponse) => row.versionNumber,
            },
            {
              key: "score",
              label: "总分 / 置信度",
              render: (row: ReportVersionResponse) =>
                `${row.contentSnapshot.overallScore.toFixed(1)} / ${row.contentSnapshot.confidence.toFixed(1)}`,
            },
            {
              key: "scoreVersion",
              label: "评分版本",
              render: (row: ReportVersionResponse) =>
                row.contentSnapshot.scoreVersion,
              secondary: true,
            },
            {
              key: "status",
              label: "状态",
              render: (row: ReportVersionResponse) => (
                <StatusBadge
                  tone={row.status === "published" ? "success" : "neutral"}
                >
                  {row.status}
                </StatusBadge>
              ),
            },
            {
              key: "action",
              label: "操作",
              render: (row: ReportVersionResponse) => (
                <Button
                  intent="ghost"
                  onClick={() =>
                    navigate(`/projects/${project.id}/reports/${row.id}`)
                  }
                >
                  查看
                </Button>
              ),
            },
          ]}
          rows={reportRows}
        />
      )}
    </>
  );
}

function ProjectOptimization({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error: projectError } = useProject(onProject);
  const [report, setReport] = useState<ReportVersionResponse>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!project?.id) return;
    void api
      .request<readonly ReportVersionResponse[]>(
        `/projects/${project.id}/reports`,
        {},
        { cache: false },
      )
      .then(async (reports) => {
        if (!reports[0]) return;
        setReport(
          await api.request<ReportVersionResponse>(
            `/projects/${project.id}/reports/${reports[0].id}`,
            {},
            { cache: false },
          ),
        );
      })
      .catch((caught) => setError(messageFor(caught)))
      .finally(() => setLoaded(true));
  }, [project?.id]);
  if (loading || !loaded) return <Skeleton lines={6} />;
  if (projectError || !project || error)
    return (
      <StatePanel
        description={projectError ?? error ?? "项目不存在。"}
        title="无法加载优化建议"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        description="建议来自最近报告的低分维度，并保留影响、投入与优先级依据。"
        title="优化建议"
      />
      {!report ? (
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/reports`)}>
              发起分析
            </Button>
          }
          description="生成第一份报告后，基于证据的建议会显示在这里。"
          title="暂无可用建议"
        />
      ) : report.recommendations.length === 0 ? (
        <StatePanel
          action={
            <Button
              onClick={() =>
                navigate(`/projects/${project.id}/reports/${report.id}`)
              }
            >
              查看最近报告
            </Button>
          }
          description="最近报告没有生成低分维度建议。"
          title="当前没有待处理建议"
        />
      ) : (
        <>
          <div className="yc-section-heading">
            <div>
              <h2>{report.title}</h2>
              <p>
                报告版本 {report.versionNumber} ·{" "}
                {report.contentSnapshot.scoreVersion}
              </p>
            </div>
            <Button
              intent="ghost"
              onClick={() =>
                navigate(`/projects/${project.id}/reports/${report.id}`)
              }
            >
              查看证据
            </Button>
          </div>
          <ResponsiveData
            columns={[
              {
                key: "priority",
                label: "优先级",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => row.priority,
              },
              {
                key: "title",
                label: "建议",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => (
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.description}</small>
                  </span>
                ),
              },
              {
                key: "impact",
                label: "影响",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => row.impact,
              },
              {
                key: "effort",
                label: "投入",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => row.effort,
              },
              {
                key: "category",
                label: "类别",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => row.category,
                secondary: true,
              },
            ]}
            rows={report.recommendations}
          />
        </>
      )}
    </>
  );
}

function ProjectReportDetail({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const { project, loading, error: projectError } = useProject(onProject);
  const [report, setReport] = useState<ReportVersionResponse>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!project?.id || !reportId) return;
    void api
      .request<ReportVersionResponse>(
        `/projects/${project.id}/reports/${reportId}`,
        {},
        { cache: false },
      )
      .then(setReport)
      .catch((caught) => setError(messageFor(caught)));
  }, [project?.id, reportId]);
  if (loading || (!report && !error)) return <Skeleton lines={7} />;
  if (projectError || !project || error || !report)
    return (
      <StatePanel
        action={
          project ? (
            <Button onClick={() => navigate(`/projects/${project.id}/history`)}>
              返回历史报告
            </Button>
          ) : undefined
        }
        description={projectError ?? error ?? "报告不存在。"}
        title="无法加载报告"
        tone="error"
      />
    );
  const modelRows = report.contentSnapshot.modelBreakdown.map(
    (item, index) => ({
      ...item,
      id: `${index}-${item.model}`,
    }),
  );
  return (
    <>
      <PageHeader
        actions={
          <Button
            intent="secondary"
            onClick={() => navigate(`/projects/${project.id}/history`)}
          >
            返回历史报告
          </Button>
        }
        description="报告内容来自冻结的模型运行、评分结果和证据快照。"
        metadata={`版本 ${report.versionNumber} · ${report.contentSnapshot.scoreVersion}`}
        title={report.title}
      />
      {report.limitationSummary && (
        <StatePanel
          description={report.limitationSummary}
          title="阅读限制"
          tone="stale"
        />
      )}
      <div className="yc-metric-grid">
        <article>
          <strong>{report.contentSnapshot.overallScore.toFixed(1)}</strong>
          <span>总分</span>
        </article>
        <article>
          <strong>{report.contentSnapshot.confidence.toFixed(1)}</strong>
          <span>置信度</span>
        </article>
        <article>
          <strong>{report.contentSnapshot.successfulRuns}</strong>
          <span>有效样本</span>
        </article>
        <article>
          <strong>{report.contentSnapshot.failedRuns}</strong>
          <span>失败样本</span>
        </article>
      </div>
      <section className="yc-card yc-section-card">
        <div className="yc-section-heading">
          <div>
            <h2>模型与问题明细</h2>
            <p>每条记录保留模型、Prompt 和运行状态。</p>
          </div>
          <StatusBadge
            tone={report.status === "published" ? "success" : "neutral"}
          >
            {report.status}
          </StatusBadge>
        </div>
        <ResponsiveData
          columns={[
            {
              key: "model",
              label: "模型",
              render: (
                row: ReportVersionResponse["contentSnapshot"]["modelBreakdown"][number],
              ) => row.model,
            },
            {
              key: "prompt",
              label: "Prompt",
              render: (
                row: ReportVersionResponse["contentSnapshot"]["modelBreakdown"][number],
              ) => row.prompt,
            },
            {
              key: "status",
              label: "状态",
              render: (
                row: ReportVersionResponse["contentSnapshot"]["modelBreakdown"][number],
              ) => (
                <StatusBadge tone={jobTone(row.status)}>
                  {row.status}
                </StatusBadge>
              ),
            },
          ]}
          rows={modelRows}
        />
      </section>
      <section className="yc-card yc-section-card">
        <h2>优化建议</h2>
        {report.recommendations.length ? (
          <ul className="yc-plain-list">
            {report.recommendations.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>
                    {item.priority} · {item.title}
                  </strong>
                  <small>{item.description}</small>
                </span>
                <span className="yc-meta">
                  影响 {item.impact} · 投入 {item.effort}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="yc-meta">当前没有低分维度建议。</p>
        )}
      </section>
    </>
  );
}

function ProjectSettings({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error, reload } = useProject(onProject);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const execute = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(undefined);
    try {
      await operation();
      await reload();
    } catch (caught) {
      setActionError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <StatePanel description={error} title="无法加载项目设置" tone="error" />
    );
  if (loading || !project) return <Skeleton lines={5} />;
  const displayedName = name || project.name;
  return (
    <>
      <PageHeader
        description="修改项目显示名称，或控制整个项目是否继续出现在活跃列表中。"
        title="项目设置"
      />
      {actionError && (
        <StatePanel description={actionError} title="操作未完成" tone="error" />
      )}
      <div className="yc-content-grid">
        <section className="yc-card yc-section-card">
          <h2>基础信息</h2>
          <FormField label="项目名称">
            <input
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              value={displayedName}
            />
          </FormField>
          <Button
            disabled={
              busy ||
              !displayedName.trim() ||
              displayedName.trim() === project.name
            }
            onClick={() =>
              void execute(() =>
                api.request(`/projects/${project.id}`, {
                  body: JSON.stringify({
                    name: displayedName.trim(),
                    version: project.version,
                  }),
                  method: "PATCH",
                }),
              )
            }
          >
            保存名称
          </Button>
        </section>
        <section className="yc-card yc-section-card">
          <h2>项目状态</h2>
          <ProjectStatus status={project.status} />
          <p className="yc-meta">
            归档会停止新的业务操作，但保留报告、审计与历史数据。
          </p>
          {project.status === "archived" ? (
            <Button
              disabled={busy}
              onClick={() =>
                void execute(() =>
                  api.request(`/projects/${project.id}/restore-actions`, {
                    method: "POST",
                  }),
                )
              }
            >
              恢复项目
            </Button>
          ) : (
            <Button
              disabled={busy}
              intent="danger"
              onClick={() => {
                if (
                  globalThis.confirm(
                    `确认归档“${project.name}”？项目数据会保留，但新的分析和编辑将停止。`,
                  )
                )
                  void execute(async () => {
                    await api.request(
                      `/projects/${project.id}/archive-actions`,
                      { method: "POST" },
                    );
                    void navigate("/projects");
                  });
              }}
            >
              归档项目
            </Button>
          )}
        </section>
      </div>
    </>
  );
}

function ProjectCompetitors({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const { project, loading, error: projectError } = useProject(onProject);
  const [competitors, setCompetitors] =
    useState<readonly CompetitorResponse[]>();
  const [error, setError] = useState<string>();
  const projectId = project?.id;
  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setCompetitors(
        await api.request<readonly CompetitorResponse[]>(
          `/projects/${projectId}/competitors`,
        ),
      );
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [projectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  const update = async (item: CompetitorResponse, status: string) => {
    if (!project) return;
    try {
      await api.request(`/projects/${project.id}/competitors/${item.id}`, {
        body: JSON.stringify({
          ...(status === "excluded"
            ? { excludedReason: "用户在竞品池排除" }
            : {}),
          status,
          version: item.version,
        }),
        method: "PATCH",
      });
      await load();
    } catch (caught) {
      setError(messageFor(caught));
    }
  };
  if (loading || !competitors) return <Skeleton lines={6} />;
  if (projectError || !project)
    return (
      <StatePanel
        description={projectError ?? "项目不存在。"}
        title="无法加载竞品"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        description="模型回答中的竞品先进入候选；排除决定会保留，后续解析不会反复推荐。"
        title="竞品池"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      {competitors.length ? (
        <ResponsiveData
          columns={[
            {
              key: "name",
              label: "竞品",
              render: (row: CompetitorResponse) => row.canonicalName,
            },
            {
              key: "evidence",
              label: "证据次数",
              render: (row: CompetitorResponse) => row.evidenceCount,
            },
            {
              key: "status",
              label: "状态",
              render: (row: CompetitorResponse) => (
                <StatusBadge
                  tone={
                    row.status === "confirmed"
                      ? "success"
                      : row.status === "excluded"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {row.status}
                </StatusBadge>
              ),
            },
            {
              key: "actions",
              label: "操作",
              render: (row: CompetitorResponse) => (
                <div className="yc-inline-actions">
                  <Button
                    intent="ghost"
                    onClick={() => void update(row, "confirmed")}
                  >
                    确认
                  </Button>
                  <Button
                    intent="ghost"
                    onClick={() => void update(row, "excluded")}
                  >
                    排除
                  </Button>
                </div>
              ),
            },
          ]}
          rows={competitors}
        />
      ) : (
        <StatePanel
          description="完成分析与回答解析后，竞品候选会显示在这里。"
          title="暂无竞品候选"
        />
      )}
    </>
  );
}

function jobTone(status: string): "success" | "danger" | "neutral" | "warning" {
  if (status === "completed" || status === "succeeded") return "success";
  if (status === "failed" || status === "outcome_unknown") return "danger";
  if (status === "running" || status === "partially_completed")
    return "warning";
  return "neutral";
}

function UsagePage({ workspaceId }: { readonly workspaceId?: string }) {
  const [usage, setUsage] = useState<UsageResponse>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!workspaceId) return;
    void api
      .request<UsageResponse>(`/workspaces/${workspaceId}/usage`)
      .then(setUsage)
      .catch((caught: unknown) => setError(messageFor(caught)));
  }, [workspaceId]);
  return (
    <>
      <PageHeader
        description="P0 不接真实支付；额度变动使用只追加账本，冲正不修改历史记录。"
        title="用量与额度"
      />
      {error ? (
        <StatePanel description={error} title="无法加载用量" tone="error" />
      ) : !usage ? (
        <Skeleton lines={5} />
      ) : (
        <>
          <section className="yc-card yc-section-card">
            <p>当前可用额度</p>
            <h2>{formatMicros(usage.balanceMicros)}</h2>
          </section>
          {usage.entries.length ? (
            <ResponsiveData
              columns={[
                {
                  key: "type",
                  label: "类型",
                  render: (row: UsageResponse["entries"][number]) =>
                    row.entryType,
                },
                {
                  key: "amount",
                  label: "金额",
                  render: (row: UsageResponse["entries"][number]) =>
                    formatMicros(row.quantityMicros),
                },
                {
                  key: "source",
                  label: "来源",
                  render: (row: UsageResponse["entries"][number]) => row.source,
                },
                {
                  key: "time",
                  label: "时间（UTC）",
                  render: (row: UsageResponse["entries"][number]) =>
                    new Date(row.createdAt)
                      .toISOString()
                      .slice(0, 19)
                      .replace("T", " "),
                  secondary: true,
                },
              ]}
              rows={usage.entries}
            />
          ) : (
            <StatePanel
              description="管理员发放额度或发起分析后会显示记录。"
              title="暂无账本记录"
            />
          )}
        </>
      )}
    </>
  );
}

function formatMicros(value: string): string {
  const amount = Number(value) / 1_000_000;
  return new Intl.NumberFormat("zh-CN", {
    currency: "CNY",
    maximumFractionDigits: 6,
    style: "currency",
  }).format(amount);
}

function useProject(
  onProject: (project: ProjectResponse) => void,
  poll = false,
) {
  const { projectId } = useParams();
  const [project, setProject] = useState<ProjectResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const result = await api.request<ProjectResponse>(
        `/projects/${projectId}`,
      );
      setProject(result);
      onProject(result);
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [onProject, projectId]);
  useEffect(() => {
    const initial = globalThis.setTimeout(() => void reload(), 0);
    if (!poll) return () => globalThis.clearTimeout(initial);
    const timer = globalThis.setInterval(() => void reload(), 2_000);
    return () => {
      globalThis.clearTimeout(initial);
      globalThis.clearInterval(timer);
    };
  }, [poll, reload]);
  return { error, loading, project, reload };
}

function ProjectStatus({ status }: { readonly status: string }) {
  const tone =
    status === "ready" || status === "active" || status === "confirmed"
      ? "success"
      : status === "failed" || status === "unavailable" || status === "rejected"
        ? "danger"
        : status === "identifying" || status === "waiting_confirmation"
          ? "warning"
          : "neutral";
  const labels: Record<string, string> = {
    active: "运行中",
    archived: "已归档",
    confirmed: "已确认",
    draft: "草稿",
    identifying: "识别中",
    ready: "已就绪",
    rejected: "已停用",
    unavailable: "不可用",
    waiting_confirmation: "待确认",
  };
  return <StatusBadge tone={tone}>{labels[status] ?? status}</StatusBadge>;
}

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="页面不存在" />
      <StatePanel
        action={
          <Button onClick={() => navigate("/dashboard")}>返回概览</Button>
        }
        description="当前地址无对应页面，或你没有访问该资源的权限。"
        title="无法打开此页面"
        tone="error"
      />
    </>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.detail.message}${error.detail.requestId ? `（请求 ${error.detail.requestId}）` : ""}`;
  return "网络连接失败，请检查后重试。";
}
