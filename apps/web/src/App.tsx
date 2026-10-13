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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { api } from "./api";
import {
  InsightSummary,
  InsightsPage,
  MonitoringPage,
  OptimizationTasksPage,
} from "./MonitoringPages";
import {
  hasProjectCapability,
  onboardingIsComplete,
  projectNavigation,
} from "./navigation";
import { formatScore } from "./score-format";

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

interface SourceSnapshotResponse {
  readonly contentHash: string;
  readonly contentPurgedAt?: string | null;
  readonly extractedText?: string | null;
  readonly fetchedAt: string;
  readonly finalUrl: string;
  readonly httpStatus: number;
  readonly id: string;
  readonly mimeType: string;
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
    readonly completedAt?: string;
    readonly errorCode?: string;
    readonly id: string;
    readonly mentions?: readonly {
      readonly confidence: string;
      readonly evidenceSnippet: string;
      readonly kind: "target" | "competitor" | "other";
      readonly rank?: number;
      readonly rawName: string;
    }[];
    readonly modelConfigVersion: {
      readonly modelConfig: {
        readonly displayName: string;
        readonly modelFamily: string;
      };
    };
    readonly promptVersion: { readonly text: string };
    readonly parseResult?: {
      readonly validSample: boolean;
    };
    readonly result?: {
      readonly citations: readonly {
        readonly title?: string;
        readonly url: string;
      }[];
      readonly finishReason?: string;
      readonly responsePurgedAt?: string;
      readonly responseText: string;
    };
    readonly status: string;
  }[];
}

interface VisibilityScoreResponse {
  readonly confidence: number | string;
  readonly confidenceLevel: string;
  readonly diagnosticOnly: boolean;
  readonly dimensions: readonly {
    readonly dimensionCode: string;
    readonly value?: number;
  }[];
  readonly overallScore: number | string;
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
    readonly analysisJobId: string;
    readonly confidence: number | string;
    readonly failedRuns: number;
    readonly modelBreakdown: readonly {
      readonly model: string;
      readonly prompt: string;
      readonly status: string;
    }[];
    readonly overallScore: number | string;
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

interface BrandAssistantRunResponse {
  readonly answer?: string;
  readonly citations: readonly {
    readonly citation: string;
    readonly label: string;
    readonly observedAt: string;
    readonly skill: string;
  }[];
  readonly contextSnapshot: {
    readonly sampledAt?: string;
    readonly sourceGeneratedAt?: string | null;
    readonly timezone?: string;
    readonly uncertainty?: {
      readonly level: "low" | "medium" | "high";
      readonly message: string;
    };
  };
  readonly createdAt: string;
  readonly errorCode?: string;
  readonly id: string;
  readonly question: string;
  readonly status: string;
}

const mainNavigation: readonly NavigationItem[] = [
  { href: "/dashboard", icon: "dashboard", label: "工作台" },
  { href: "/projects", icon: "projects", label: "项目" },
  {
    href: "/workspaces",
    icon: "workspaces",
    group: "工作空间",
    label: "工作区",
  },
  { href: "/notifications", icon: "notifications", label: "通知" },
  { href: "/usage", icon: "usage", label: "用量" },
  { href: "/team", icon: "team", label: "团队" },
  { href: "/settings", icon: "settings", label: "设置" },
];

export function App() {
  const [session, setSession] = useState<SessionView>();
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string>();
  const loadSession = useCallback(() => {
    setLoading(true);
    setSessionError(undefined);
    void api
      .getSession()
      .then((next) => {
        if (next.audience === "user") setSession(next);
        else {
          api.setSession(undefined);
          setSession(undefined);
        }
      })
      .catch((caught: unknown) => {
        setSession(undefined);
        if (!(caught instanceof ApiError && caught.status === 401))
          setSessionError(messageFor(caught));
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const timer = globalThis.setTimeout(loadSession, 0);
    return () => globalThis.clearTimeout(timer);
  }, [loadSession]);
  if (loading)
    return (
      <main className="yc-auth-page">
        <section className="yc-auth-card">
          <Skeleton lines={4} />
        </section>
      </main>
    );
  if (sessionError)
    return (
      <main className="yc-auth-page">
        <section className="yc-auth-card">
          <StatePanel
            action={<Button onClick={loadSession}>重新连接</Button>}
            description={sessionError}
            title="暂时无法连接映川"
            tone="error"
          />
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
  const perform = async <T,>(
    operation: () => Promise<T>,
  ): Promise<T | false> => {
    setBusy(true);
    setError(undefined);
    try {
      return await operation();
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
        perform(() =>
          api.request<{ accepted: true; developmentCode?: string }>(
            "/auth/email-code-requests",
            {
              body: JSON.stringify({ audience: "user", email }),
              method: "POST",
            },
          ),
        )
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
          assistant: true,
          website: hasProjectCapability(
            activeProject?.capabilities ?? [],
            "website",
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
      onNavigate={(href) => navigate(href)}
      onWorkspaceChange={selectWorkspace}
      projectNavigation={projectItems}
      projectTitle={activeProject?.name}
      userEmail={session.email}
      workspaceId={workspaceId}
      workspaces={shellWorkspaces}
    >
      {loading ? (
        <Skeleton lines={7} />
      ) : (
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
            path="/projects/:projectId/insights"
            element={
              <ProjectFeature kind="insights" onProject={setActiveProject} />
            }
          />
          <Route
            path="/projects/:projectId/monitoring"
            element={
              <ProjectFeature kind="monitoring" onProject={setActiveProject} />
            }
          />
          <Route
            path="/projects/:projectId/optimization-tasks"
            element={
              <ProjectFeature kind="tasks" onProject={setActiveProject} />
            }
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
            path="/projects/:projectId/answers"
            element={<ProjectAnswers onProject={setActiveProject} />}
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
            path="/projects/:projectId/assistant"
            element={<ProjectAssistant onProject={setActiveProject} />}
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
          <Route
            path="/team"
            element={
              <TeamPage
                canManage={
                  workspaces
                    .find((item) => item.id === workspaceId)
                    ?.memberships.some((membership) =>
                      ["owner", "admin"].includes(membership.role.code),
                    ) ?? false
                }
                isOwner={
                  workspaces
                    .find((item) => item.id === workspaceId)
                    ?.memberships.some(
                      (membership) => membership.role.code === "owner",
                    ) ?? false
                }
                workspaceId={workspaceId}
              />
            }
          />
          <Route
            path="/settings"
            element={<SettingsPage workspaceId={workspaceId} />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      )}
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
          workspaceId && projects?.length ? (
            <Button onClick={() => navigate("/projects/new")}>创建项目</Button>
          ) : undefined
        }
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
            <Button onClick={() => navigate("/workspaces")}>创建工作区</Button>
          }
          description="创建工作区后即可添加品牌项目。"
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
                  projects.filter((project) =>
                    onboardingIsComplete(
                      project.status,
                      project.onboardingStatus,
                    ),
                  ).length
                }
              </strong>
              <span>已确认品牌</span>
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
            <Button onClick={() => navigate("/projects/new")}>
              创建第一个项目
            </Button>
          }
          description="添加品牌名称，开始首次分析。"
          title="创建第一个品牌项目"
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
      <PageHeader title="通知" />
      {error ? (
        <StatePanel description={error} title="无法加载通知" tone="error" />
      ) : !rows ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <StatePanel description="报告生成后会收到通知。" title="暂无通知" />
      ) : (
        <ul className="yc-plain-list">
          {rows.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.body} · {formatDateTime(item.createdAt)}
                </small>
              </span>
              <div className="yc-actions">
                {!item.readAt && <StatusBadge tone="info">未读</StatusBadge>}
                <Button intent="ghost" onClick={() => void open(item)}>
                  {item.href ? "查看" : item.readAt ? "已读" : "标为已读"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TeamPage({
  canManage,
  isOwner,
  workspaceId,
}: {
  readonly canManage: boolean;
  readonly isOwner: boolean;
  readonly workspaceId?: string;
}) {
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
  const ownerCount =
    members?.filter((member) => member.role.code === "owner").length ?? 0;
  if (!workspaceId)
    return <StatePanel description="请先选择工作区。" title="尚未选择工作区" />;
  return (
    <>
      <PageHeader title="团队与权限" />
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
                  render: (row: WorkspaceMemberResponse) =>
                    !canManage ||
                    (row.role.code === "owner" && ownerCount === 1) ? (
                      <span>{roleLabel(row.role.code)}</span>
                    ) : (
                      <select
                        aria-label={`调整 ${row.user.displayEmail} 的角色`}
                        disabled={
                          busy || (row.role.code === "owner" && !isOwner)
                        }
                        onChange={(event) => {
                          const nextRole = event.target.value;
                          if (
                            globalThis.confirm(
                              `确认将 ${row.user.displayEmail} 的角色改为${roleLabel(nextRole)}？`,
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
                    formatDateTime(row.createdAt),
                  secondary: true,
                },
                {
                  key: "action",
                  label: "操作",
                  render: (row: WorkspaceMemberResponse) =>
                    row.role.code === "owner" && ownerCount === 1 ? (
                      <span className="yc-meta">须保留唯一所有者</span>
                    ) : !canManage ||
                      (row.role.code === "owner" && !isOwner) ? (
                      <span className="yc-meta">无管理权限</span>
                    ) : (
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
        {canManage && (
          <section className="yc-card yc-section-card">
            <h2>邀请成员</h2>
            <FormField hint="邮件邀请 7 天内有效。" label="邮箱">
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
                        {roleLabel(item.role.code)} · 到期时间：
                        {formatDateTime(item.expiresAt)}
                      </small>
                    </span>
                    <StatusBadge
                      tone={item.status === "active" ? "success" : "neutral"}
                    >
                      {invitationStatusLabel(item.status)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="yc-meta">暂无待处理邀请。</p>
            )}
          </section>
        )}
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
      <PageHeader title="设置" />
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
          <FormField hint="粘贴邀请邮件中的加入码。" label="加入码">
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
  const [createError, setCreateError] = useState<string>();
  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setCreateError(undefined);
    try {
      await api.request("/workspaces", {
        body: JSON.stringify({ name: name.trim() }),
        method: "POST",
      });
      setName("");
      await reload();
    } catch (caught) {
      setCreateError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader title="工作区" />
      {createError && (
        <StatePanel
          description={createError}
          title="工作区创建失败"
          tone="error"
        />
      )}
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
                        {roleLabel(
                          workspace.memberships[0]?.role.code ?? "member",
                        )}
                      </small>
                    </span>
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
          workspaceId && projects.length > 0 ? (
            <Button onClick={() => navigate("/projects/new")}>创建项目</Button>
          ) : undefined
        }
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
          description="填写品牌名称即可创建项目。"
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
      <PageHeader title="创建品牌项目" />
      <section className="yc-card yc-section-card yc-form-card">
        <FormField label="项目/品牌名称">
          <input
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </FormField>
        <FormField hint="填写官网地址；抓取前需确认。" label="官网（可选）">
          <input
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="https://example.com"
            type="url"
            value={websiteUrl}
          />
        </FormField>
        <div className="yc-form-row">
          <FormField label="主要市场">
            <select
              onChange={(event) => setCountry(event.target.value)}
              value={country}
            >
              <option value="CN">中国大陆</option>
              <option value="HK">中国香港</option>
              <option value="TW">中国台湾</option>
              <option value="SG">新加坡</option>
              <option value="JP">日本</option>
              <option value="KR">韩国</option>
              <option value="US">美国</option>
              <option value="GB">英国</option>
            </select>
          </FormField>
          <FormField label="主要语言">
            <select
              onChange={(event) => setLanguage(event.target.value)}
              value={language}
            >
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁体中文</option>
              <option value="en-US">English</option>
              <option value="ja-JP">日本語</option>
              <option value="ko-KR">한국어</option>
            </select>
          </FormField>
          <FormField label="时区">
            <select
              onChange={(event) => setTimezone(event.target.value)}
              value={timezone}
            >
              <option value="Asia/Shanghai">北京时间</option>
              <option value="Asia/Hong_Kong">香港时间</option>
              <option value="Asia/Singapore">新加坡时间</option>
              <option value="Asia/Tokyo">日本时间</option>
              <option value="Asia/Seoul">韩国时间</option>
              <option value="America/Los_Angeles">美国太平洋时间</option>
              <option value="America/New_York">美国东部时间</option>
              <option value="Europe/London">英国时间</option>
            </select>
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
  const [actionError, setActionError] = useState<string>();
  const confirm = async (candidateId: string) => {
    if (!project) return;
    setSaving(true);
    setActionError(undefined);
    try {
      const confirmed = await api.request<ProjectResponse>(
        `/projects/${project.id}/identification-confirmations`,
        { body: JSON.stringify({ candidateId }), method: "POST" },
      );
      onProject(confirmed);
      void navigate(`/projects/${confirmed.id}/overview`);
    } catch (caught) {
      setActionError(messageFor(caught));
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
  const pendingCandidates = project.brandCandidates.filter(
    (candidate) => candidate.status === "pending",
  );
  if (onboardingIsComplete(project.status, project.onboardingStatus)) {
    return <Navigate replace to={`/projects/${project.id}/overview`} />;
  }
  return (
    <>
      <PageHeader
        actions={
          pendingCandidates.length === 0 ? (
            <Button intent="secondary" onClick={() => void reload()}>
              刷新状态
            </Button>
          ) : undefined
        }
        metadata={`状态：${pendingCandidates.length > 0 ? "待确认品牌" : onboardingStatusLabel(project.onboardingStatus)}`}
        title={project.name}
      />
      {actionError && (
        <StatePanel
          description={actionError}
          title="品牌确认失败"
          tone="error"
        />
      )}
      {project.status === "identifying" ? (
        <StatePanel
          description="识别中，可离开此页稍后查看。"
          title="正在识别品牌"
          tone="stale"
        />
      ) : project.status === "draft" ? (
        <StatePanel
          action={<Button onClick={() => void reload()}>重新查看</Button>}
          description="识别未完成，品牌信息已保存。"
          title="已保存为草稿"
          tone="error"
        />
      ) : pendingCandidates.length ? (
        <section className="yc-card yc-section-card">
          <h2>确认品牌候选</h2>
          <ul className="yc-plain-list">
            {pendingCandidates.map((candidate) => (
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
      ) : (
        <StatePanel
          action={<Button onClick={() => void reload()}>重新检查</Button>}
          description="品牌信息已保存，可稍后刷新查看候选。"
          title="暂无品牌候选"
        />
      )}
    </>
  );
}

function ProjectFeature({
  kind,
  onProject,
}: {
  readonly kind: "insights" | "monitoring" | "tasks";
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const { project, loading, error } = useProject(onProject);
  if (loading) return <Skeleton lines={6} />;
  if (error || !project)
    return (
      <StatePanel
        title="无法加载项目"
        description={error ?? "项目不存在。"}
        tone="error"
      />
    );
  if (kind === "insights")
    return <InsightsPage key={project.id} projectId={project.id} />;
  if (kind === "monitoring")
    return <MonitoringPage key={project.id} projectId={project.id} />;
  return <OptimizationTasksPage key={project.id} projectId={project.id} />;
}

function ProjectOverview({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const { project, loading, error } = useProject(onProject);
  const [reports, setReports] = useState<readonly ReportVersionResponse[]>();
  const [prompts, setPrompts] = useState<readonly PromptResponse[]>();
  const [summaryError, setSummaryError] = useState<string>();
  useEffect(() => {
    if (!project?.id) return;
    let active = true;
    void Promise.allSettled([
      api.request<readonly ReportVersionResponse[]>(
        `/projects/${project.id}/reports`,
        {},
        { cache: false },
      ),
      api.request<readonly PromptResponse[]>(`/projects/${project.id}/prompts`),
    ]).then(([reportResult, promptResult]) => {
      if (!active) return;
      if (reportResult.status === "fulfilled") setReports(reportResult.value);
      if (promptResult.status === "fulfilled") setPrompts(promptResult.value);
      if (
        reportResult.status === "rejected" ||
        promptResult.status === "rejected"
      )
        setSummaryError("部分分析数据暂时无法读取，可进入对应页面重试。");
      else setSummaryError(undefined);
    });
    return () => {
      active = false;
    };
  }, [project?.id]);
  if (loading) return <Skeleton lines={5} />;
  if (error || !project)
    return (
      <StatePanel
        description={error ?? "项目不存在。"}
        title="无法加载项目"
        tone="error"
      />
    );
  const latest = reports?.[0];
  return (
    <>
      <PageHeader
        actions={
          latest ? (
            <Button onClick={() => navigate(`/projects/${project.id}/reports`)}>
              查看可见度分析
            </Button>
          ) : undefined
        }
        title={project.name}
      />
      <InsightSummary key={project.id} projectId={project.id} />
      {summaryError && (
        <StatePanel
          description={summaryError}
          title="数据加载不完整"
          tone="stale"
        />
      )}
      {latest ? (
        <>
          {latest.limitationSummary && (
            <StatePanel
              description={latest.limitationSummary}
              title="本次结果的限制"
              tone="stale"
            />
          )}
          <div className="yc-metric-grid">
            <article>
              <strong>
                {formatScore(latest.contentSnapshot.overallScore)}
              </strong>
              <span>可见度分 · {latest.contentSnapshot.scoreVersion}</span>
            </article>
            <article>
              <strong>{formatScore(latest.contentSnapshot.confidence)}</strong>
              <span>置信度</span>
            </article>
            <article>
              <strong>{latest.contentSnapshot.successfulRuns}</strong>
              <span>有效模型回答</span>
            </article>
            <article>
              <strong>{latest.contentSnapshot.failedRuns}</strong>
              <span>失败运行</span>
            </article>
          </div>
        </>
      ) : reports ? (
        <StatePanel
          action={
            <Button
              onClick={() =>
                navigate(
                  `/projects/${project.id}/${prompts?.some((item) => item.enabled) ? "reports" : "prompts"}`,
                )
              }
            >
              {prompts?.some((item) => item.enabled)
                ? "核对预计用量"
                : "配置分析问题"}
            </Button>
          }
          description={
            prompts?.some((item) => item.enabled)
              ? "核对预计用量，提交首次分析。"
              : "添加分析问题，开始首次分析。"
          }
          title="还没有分析报告"
        />
      ) : (
        <Skeleton lines={3} />
      )}
      <div className="yc-content-grid yc-overview-grid">
        <section className="yc-card yc-section-card">
          <h2>品牌信息</h2>
          <p>
            <strong>{project.brandEntity?.canonicalName ?? "待确认"}</strong>
          </p>
          <ProjectStatus status={project.status} />
          <p className="yc-meta">
            已配置 {prompts?.length ?? "—"} 个用户提问，其中{" "}
            {prompts?.filter((item) => item.enabled).length ?? "—"} 个启用。
          </p>
          <Button
            intent="secondary"
            onClick={() => navigate(`/projects/${project.id}/prompts`)}
          >
            管理用户提问
          </Button>
        </section>
        <section className="yc-card yc-section-card">
          <h2>认知源</h2>
          <p>{project.knowledgeSources.length} 个来源</p>

          <Button
            intent="secondary"
            onClick={() => navigate(`/projects/${project.id}/sources`)}
          >
            管理认知源
          </Button>
        </section>
      </div>
      {latest && (
        <section className="yc-card yc-section-card yc-overview-next">
          <h2>继续分析</h2>
          <div className="yc-overview-links">
            <button
              onClick={() => navigate(`/projects/${project.id}/answers`)}
              type="button"
            >
              <strong>查看模型回答</strong>
              <span>按问题和模型复核原文、提及与引用</span>
            </button>
            <button
              onClick={() => navigate(`/projects/${project.id}/competitors`)}
              type="button"
            >
              <strong>核对竞品</strong>
              <span>确认或排除解析出的竞品候选</span>
            </button>
            <button
              onClick={() => navigate(`/projects/${project.id}/optimization`)}
              type="button"
            >
              <strong>查看优化建议</strong>
              <span>根据最新报告确定下一步</span>
            </button>
          </div>
        </section>
      )}
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
          description="先确认品牌，查看品牌资料。"
          title="品牌尚未确认"
        />
      ) : (
        <div className="yc-content-grid">
          <section className="yc-card yc-section-card">
            <h2>{brand.canonicalName}</h2>
            <dl className="yc-definition-list">
              <div>
                <dt>品牌名称</dt>
                <dd>{brand.canonicalName}</dd>
              </div>
              <div>
                <dt>官网</dt>
                <dd>{brand.officialWebsite ?? "未设置"}</dd>
              </div>
              <div>
                <dt>国家/地区</dt>
                <dd>
                  {brand.country === "CN"
                    ? "中国大陆"
                    : (brand.country ?? "未设置")}
                </dd>
              </div>
              <div>
                <dt>主要语言</dt>
                <dd>
                  {brand.primaryLanguage === "zh-CN"
                    ? "简体中文"
                    : (brand.primaryLanguage ?? "未设置")}
                </dd>
              </div>
            </dl>
          </section>
          <section className="yc-card yc-section-card">
            <h2>品牌认知状态</h2>
            <ProjectStatus status={project.status} />
            <p className="yc-meta">
              {project.knowledgeSources.length} 个认知源
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
  if (!hasProjectCapability(project.capabilities, "website")) {
    return (
      <>
        <PageHeader title="官网" />
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/sources`)}>
              管理认知源
            </Button>
          }
          description="添加并确认官网后可查看抓取状态。"
          title="官网尚未启用"
          tone="empty"
        />
      </>
    );
  }
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
                  ? formatDateTime(row.lastSuccessfulFetchedAt)
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
          description="请先添加并确认官网地址。"
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
  const [type, setType] = useState("official_website");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource>();
  const [snapshots, setSnapshots] =
    useState<readonly SourceSnapshotResponse[]>();
  const [snapshotsError, setSnapshotsError] = useState<string>();
  const snapshotRequest = useRef(0);
  const loadSnapshots = async (source: KnowledgeSource) => {
    if (!project) return;
    const request = ++snapshotRequest.current;
    setSelectedSource(source);
    setSnapshots(undefined);
    setSnapshotsError(undefined);
    try {
      const next = await api.request<readonly SourceSnapshotResponse[]>(
        `/projects/${project.id}/sources/${source.id}/snapshots`,
        {},
        { cache: false },
      );
      if (snapshotRequest.current === request) setSnapshots(next);
    } catch (caught) {
      if (snapshotRequest.current === request)
        setSnapshotsError(messageFor(caught));
    }
  };
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
      <PageHeader title="认知源" />
      {actionError && (
        <StatePanel description={actionError} title="操作未完成" tone="error" />
      )}
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
                  render: (row) => sourceTypeLabel(row.type),
                  secondary: true,
                },
                {
                  key: "status",
                  label: "状态",
                  render: (row) => <ProjectStatus status={row.status} />,
                },
                {
                  key: "action",
                  label: "操作",
                  render: (row) => (
                    <div className="yc-actions">
                      <Button
                        intent="ghost"
                        onClick={() => void loadSnapshots(row)}
                      >
                        查看记录
                      </Button>
                      <Button
                        disabled={busy || row.status !== "confirmed"}
                        intent="ghost"
                        onClick={() => void fetchSource(row.id)}
                      >
                        立即抓取
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={project.knowledgeSources}
            />
          ) : (
            <StatePanel
              description="添加并确认公开页面后即可抓取。"
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
          <Button disabled={busy || !url.trim()} onClick={() => void add()}>
            {busy ? "处理中…" : "确认并添加"}
          </Button>
        </section>
      </div>
      {selectedSource && (
        <section className="yc-card yc-section-card">
          <div className="yc-section-heading">
            <div>
              <h2>抓取记录</h2>
              <p className="yc-meta yc-source-url">
                {selectedSource.originalUrl}
              </p>
            </div>
            <Button
              intent="secondary"
              onClick={() => void loadSnapshots(selectedSource)}
            >
              刷新记录
            </Button>
          </div>
          {snapshotsError ? (
            <StatePanel
              description={snapshotsError}
              title="记录加载失败"
              tone="error"
            />
          ) : !snapshots ? (
            <Skeleton lines={3} />
          ) : snapshots.length === 0 ? (
            <StatePanel
              description="点击“立即抓取”获取页面内容。"
              title="暂无抓取记录"
            />
          ) : (
            <ResponsiveData
              rows={snapshots}
              columns={[
                {
                  key: "fetchedAt",
                  label: "抓取时间",
                  render: (row) => formatDateTime(row.fetchedAt),
                },
                {
                  key: "status",
                  label: "响应",
                  render: (row) => `${row.httpStatus} · ${row.mimeType}`,
                },
                {
                  key: "content",
                  label: "内容",
                  render: (row) =>
                    row.contentPurgedAt
                      ? "正文已按保留规则清理"
                      : row.extractedText
                        ? `${row.extractedText.slice(0, 160)}${row.extractedText.length > 160 ? "…" : ""}`
                        : "未提取到正文",
                },
              ]}
            />
          )}
        </section>
      )}
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
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
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
        title="无法加载分析问题"
        tone="error"
      />
    );
  const groups = [
    ...new Set(prompts.map((item) => item.groupKey || "未分组")),
  ].sort();
  const visiblePrompts = prompts.filter(
    (item) =>
      item.text.toLowerCase().includes(search.trim().toLowerCase()) &&
      (groupFilter === "all" || (item.groupKey || "未分组") === groupFilter) &&
      (statusFilter === "all" || (statusFilter === "enabled") === item.enabled),
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
            生成建议问题
          </Button>
        }
        title="用户提问"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      {prompts.length > 0 && (
        <div className="yc-answer-filters yc-prompt-filters">
          <label>
            搜索提问
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索问题内容"
              value={search}
            />
          </label>
          <label>
            分组
            <select
              onChange={(event) => setGroupFilter(event.target.value)}
              value={groupFilter}
            >
              <option value="all">全部分组</option>
              {groups.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            启用状态
            <select
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">全部状态</option>
              <option value="enabled">已启用</option>
              <option value="disabled">已停用</option>
            </select>
          </label>
          <p className="yc-prompt-count">
            {prompts.filter((item) => item.enabled).length} 个启用 /{" "}
            {prompts.length} 个提问
          </p>
        </div>
      )}
      <div
        className={`yc-content-grid${prompts.length === 0 ? " yc-prompt-first-use" : ""}`}
      >
        <section>
          {prompts.length && !visiblePrompts.length ? (
            <StatePanel
              description="请调整筛选条件。"
              title="没有符合条件的提问"
            />
          ) : prompts.length ? (
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
                  label: "分类 / 范围",
                  render: (row) =>
                    `${promptCategoryLabel(row.category)} / ${promptScopeLabel(row.scope)}${row.requiresWebSearch ? " / 需联网" : ""}`,
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
                        生成变体
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
                        版本记录
                      </Button>
                      <Button
                        disabled={busy}
                        intent="ghost"
                        onClick={() => {
                          if (
                            globalThis.confirm(
                              `确认删除“${row.text}”？历史分析仍会保留当时使用的问题版本。`,
                            )
                          )
                            void execute(() =>
                              api.request(
                                `/projects/${project.id}/prompts/${row.id}`,
                                { method: "DELETE" },
                              ),
                            );
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={visiblePrompts}
            />
          ) : (
            <StatePanel
              description="生成建议问题，或手动添加。"
              title="暂无分析问题"
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
            <FormField hint="使用完整名称，避免缩写歧义。" label="问题">
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
              <FormField label="适用范围">
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
              需要联网（不支持的模型将跳过）
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
              添加分析问题
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

function AnalysisEstimatePanel({
  busy,
  error,
  estimate,
  onRefresh,
}: {
  readonly busy: boolean;
  readonly error?: string;
  readonly estimate?: AnalysisEstimateResponse;
  readonly onRefresh: () => void;
}) {
  return (
    <section className="yc-card yc-section-card">
      <div className="yc-section-heading">
        <div>
          <h2>预计用量</h2>
        </div>
        <Button disabled={busy} intent="ghost" onClick={onRefresh}>
          {busy ? "计算中…" : "更新估算"}
        </Button>
      </div>
      {error && (
        <p className="yc-form-field__error" role="alert">
          {error}
        </p>
      )}
      {estimate &&
      (estimate.eligibleRunCount > 0 || estimate.skippedRunCount > 0) ? (
        <div className="yc-metric-grid">
          <article>
            <strong>{estimate.eligibleRunCount}</strong>
            <span>预计执行次数</span>
          </article>
          <article>
            <strong>{estimate.skippedRunCount}</strong>
            <span>不满足条件的组合</span>
          </article>
          <article>
            <strong>{formatMicros(estimate.estimatedCostMicros)}</strong>
            <span>预估模型成本</span>
          </article>
        </div>
      ) : estimate ? (
        <p className="yc-meta">
          请启用分析问题；若仍无法运行，请联系管理员检查模型。
        </p>
      ) : !error ? (
        <Skeleton lines={2} />
      ) : null}
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
  const [estimate, setEstimate] = useState<AnalysisEstimateResponse>();
  const [estimateError, setEstimateError] = useState<string>();
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [confirmAnalysis, setConfirmAnalysis] = useState(false);
  const projectId = project?.id;
  const loadEstimate = useCallback(async () => {
    if (!projectId) return undefined;
    setEstimateBusy(true);
    setEstimateError(undefined);
    try {
      const next = await api.request<AnalysisEstimateResponse>(
        `/projects/${projectId}/analysis-estimates`,
        { method: "POST" },
      );
      setEstimate(next);
      return next;
    } catch (caught) {
      setEstimate(undefined);
      setEstimateError(messageFor(caught));
      return undefined;
    } finally {
      setEstimateBusy(false);
    }
  }, [projectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setEstimate(undefined);
      setConfirmAnalysis(false);
      void loadEstimate();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [loadEstimate]);
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
      return true;
    } catch (caught) {
      setError(messageFor(caught));
      return false;
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
          estimate?.eligibleRunCount === 0 ? (
            <Button onClick={() => navigate(`/projects/${project.id}/prompts`)}>
              检查分析问题
            </Button>
          ) : (
            <Button
              disabled={busy || estimateBusy}
              onClick={() => {
                void loadEstimate().then((next) => {
                  if (next) setConfirmAnalysis(true);
                });
              }}
            >
              {estimateBusy ? "核对估算中…" : "发起新分析"}
            </Button>
          )
        }
        title="AI 可见度分析"
      />
      {error && (
        <StatePanel description={error} title="操作未完成" tone="error" />
      )}
      <AnalysisEstimatePanel
        busy={estimateBusy}
        error={estimateError}
        estimate={estimate}
        onRefresh={() => void loadEstimate()}
      />
      {confirmAnalysis && estimate && (
        <section
          aria-labelledby="analysis-confirm-heading"
          className="yc-card yc-section-card"
        >
          <h2 id="analysis-confirm-heading">确认本次分析</h2>
          {estimate.eligibleRunCount === 0 ? (
            <StatePanel
              action={
                <Button
                  intent="secondary"
                  onClick={() => navigate(`/projects/${project.id}/prompts`)}
                >
                  检查分析问题
                </Button>
              }
              description="请启用分析问题，或联系管理员检查模型。"
              title="暂时无法提交"
              tone="stale"
            />
          ) : (
            <p className="yc-meta">
              将执行 {estimate.eligibleRunCount} 次模型分析，预估模型成本{" "}
              {formatMicros(estimate.estimatedCostMicros)}。
              {estimate.skippedRunCount > 0 &&
                ` 另有 ${estimate.skippedRunCount} 个组合不满足运行条件，将被跳过。`}
              实际扣减以用量记录为准。
            </p>
          )}
          <div className="yc-actions">
            {estimate.eligibleRunCount > 0 && (
              <Button
                disabled={busy}
                onClick={() => {
                  void execute(() =>
                    api.request(`/projects/${project.id}/analysis-jobs`, {
                      headers: {
                        "Idempotency-Key": globalThis.crypto.randomUUID(),
                      },
                      method: "POST",
                    }),
                  ).then((submitted) => {
                    if (submitted) setConfirmAnalysis(false);
                  });
                }}
              >
                {busy ? "提交中…" : "确认并提交"}
              </Button>
            )}
            <Button intent="ghost" onClick={() => setConfirmAnalysis(false)}>
              {estimate.eligibleRunCount > 0 ? "取消" : "关闭"}
            </Button>
          </div>
        </section>
      )}
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
              {reportStatusLabel(report.status)}
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
              <strong>
                {formatScore(report.contentSnapshot.overallScore)}
              </strong>
              <span>总分</span>
            </article>
            <article>
              <strong>{formatScore(report.contentSnapshot.confidence)}</strong>
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
          <h3>优化建议</h3>
          {report.recommendations.length === 0 ? (
            <p className="yc-meta">当前没有低分维度建议。</p>
          ) : (
            <ul className="yc-plain-list">
              {report.recommendations.map((item) => (
                <li key={item.id}>
                  <span>
                    <strong>
                      {recommendationPriorityLabel(item.priority)} ·{" "}
                      {recommendationTitle(item.title, item.category)}
                    </strong>
                    <small>
                      {recommendationDescription(
                        item.description,
                        item.category,
                      )}
                    </small>
                  </span>
                  <span className="yc-meta">
                    投入 {recommendationEffortLabel(item.effort)}
                  </span>
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
              <h2>{formatScore(score.overallScore)} / 100</h2>
              <p>
                {score.scoreVersion} · 置信度 {formatScore(score.confidence)} (
                {confidenceLevelLabel(score.confidenceLevel)})
              </p>
            </div>
            <StatusBadge tone={score.diagnosticOnly ? "warning" : "success"}>
              {score.diagnosticOnly ? "诊断结果" : "可用于趋势对比"}
            </StatusBadge>
          </div>
          <div className="yc-metric-grid">
            {score.dimensions.map((item) => (
              <article key={item.dimensionCode}>
                <strong>
                  {item.value === null || item.value === undefined
                    ? "暂无数据"
                    : Number(item.value).toFixed(1)}
                </strong>
                <span>{scoreDimensionLabel(item.dimensionCode)}</span>
              </article>
            ))}
          </div>
        </section>
      )}
      {!selected && estimate?.eligibleRunCount === 0 ? null : !selected ? (
        <StatePanel
          description="确认预计用量后发起第一次分析。"
          title="暂无分析任务"
        />
      ) : (
        <div className="yc-content-grid">
          <section className="yc-card yc-section-card">
            <div className="yc-section-heading">
              <div>
                <h2>最新任务</h2>
                <p>{formatDateTime(selected.createdAt)}</p>
              </div>
              <div className="yc-inline-actions">
                <StatusBadge tone={jobTone(selected.status)}>
                  {jobStatusLabel(selected.status)}
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
                    label: "分析问题",
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
                        {jobStatusLabel(row.status)}
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
          历史任务 {jobs.length} 个，报告版本 {reports.length} 个。
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
        metadata={`创建于 ${formatDateTime(job.createdAt)}`}
        title="分析任务详情"
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
          <StatusBadge tone={jobTone(job.status)}>
            {jobStatusLabel(job.status)}
          </StatusBadge>
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
              label: "分析问题",
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
                  {jobStatusLabel(row.status)}
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
          description="提交分析后可查看模型运行记录。"
          title="暂无运行记录"
        />
      )}
    </>
  );
}

function ProjectAnswers({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const {
    project,
    loading: projectLoading,
    error: projectError,
  } = useProject(onProject);
  const [jobs, setJobs] = useState<readonly AnalysisJobResponse[]>([]);
  const answerLocation = useLocation();
  const answerQuery = new URLSearchParams(answerLocation.search);
  const initialJobId = answerQuery.get("jobId");
  const initialRunId = answerQuery.get("runId") ?? "";
  const [jobsProjectId, setJobsProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<AnalysisJobResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [model, setModel] = useState("all");
  const [mention, setMention] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(initialRunId);
  const projectId = project?.id;

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void api
      .request<readonly AnalysisJobResponse[]>(
        `/projects/${projectId}/analysis-jobs`,
        {},
        { cache: false },
      )
      .then((items) => {
        if (!active) return;
        setJobs(items);
        setJobsProjectId(projectId);
        setJobId(
          items.find((item) => item.id === initialJobId)?.id ??
            items[0]?.id ??
            "",
        );
        setLoading(Boolean(items.length));
      })
      .catch((caught: unknown) => {
        if (active) {
          setJobsProjectId(projectId);
          setError(messageFor(caught));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [projectId, initialJobId]);

  const loadJob = useCallback(async () => {
    if (!jobId || jobsProjectId !== projectId) return;
    setLoading(true);
    try {
      const detail = await api.request<AnalysisJobResponse>(
        `/analysis-jobs/${jobId}`,
        {},
        { cache: false },
      );
      setJob(detail);
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoading(false);
    }
  }, [jobId, jobsProjectId, projectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => void loadJob(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [loadJob]);

  const visibleJobs = jobsProjectId === projectId ? jobs : [];
  const activeJob = visibleJobs.some((item) => item.id === job?.id)
    ? job
    : undefined;
  const runs = activeJob?.runs ?? [];
  const models = [
    ...new Set(
      runs.map((run) => run.modelConfigVersion.modelConfig.displayName),
    ),
  ];
  const filtered = runs.filter((run) => {
    const target = run.mentions?.some((item) => item.kind === "target");
    const parsed = run.parseResult?.validSample && run.status === "succeeded";
    const matchMention =
      mention === "all" ||
      (mention === "mentioned" && target) ||
      (mention === "not-mentioned" && parsed && !target) ||
      (mention === "unavailable" && !parsed);
    return (
      (model === "all" ||
        run.modelConfigVersion.modelConfig.displayName === model) &&
      matchMention &&
      (run.promptVersion.text
        .toLowerCase()
        .includes(query.trim().toLowerCase()) ||
        run.modelConfigVersion.modelConfig.displayName
          .toLowerCase()
          .includes(query.trim().toLowerCase()))
    );
  });
  const selected =
    filtered.find((run) => run.id === selectedRunId) ?? filtered[0];
  if (projectLoading || loading || jobsProjectId !== projectId)
    return <Skeleton lines={7} />;
  if (projectError || !project || error)
    return (
      <StatePanel
        description={projectError ?? error ?? "项目不存在。"}
        title="无法加载回答记录"
        tone="error"
      />
    );
  return (
    <>
      <PageHeader
        actions={
          <Button intent="secondary" onClick={() => void loadJob()}>
            刷新记录
          </Button>
        }
        title="大模型回答记录"
      />
      {!visibleJobs.length ? (
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/reports`)}>
              前往可见度分析
            </Button>
          }
          description="发起分析后可查看模型回答。"
          title="暂无回答记录"
        />
      ) : (
        <>
          <div className="yc-answer-filters">
            <label>
              分析任务
              <select
                onChange={(event) => {
                  setJobId(event.target.value);
                  setSelectedRunId("");
                }}
                value={jobId}
              >
                {visibleJobs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatDateTime(item.createdAt)} ·{" "}
                    {jobStatusLabel(item.status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              模型
              <select
                onChange={(event) => setModel(event.target.value)}
                value={model}
              >
                <option value="all">全部模型</option>
                {models.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              提及状态
              <select
                onChange={(event) => setMention(event.target.value)}
                value={mention}
              >
                <option value="all">全部状态</option>
                <option value="mentioned">已提及</option>
                <option value="not-mentioned">未提及</option>
                <option value="unavailable">未得出结论</option>
              </select>
            </label>
            <label>
              搜索提问
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入问题或模型"
                value={query}
              />
            </label>
          </div>
          {activeJob && activeJob.status !== "completed" && (
            <StatePanel
              description={`本任务状态：${jobStatusLabel(activeJob.status)}。仅有效回答计入评分。`}
              title="任务结果可能不完整"
              tone="stale"
            />
          )}
          <div className="yc-answer-layout">
            <section aria-label="回答列表" className="yc-answer-list yc-card">
              <div className="yc-answer-list__heading">
                {filtered.length} 条回答
              </div>
              {filtered.length ? (
                filtered.map((run) => {
                  const target = run.mentions?.some(
                    (item) => item.kind === "target",
                  );
                  const parsed =
                    run.parseResult?.validSample && run.status === "succeeded";
                  const truncated = run.result?.finishReason === "length";
                  return (
                    <button
                      aria-pressed={selected?.id === run.id}
                      className="yc-answer-list__item"
                      key={run.id}
                      onClick={() => setSelectedRunId(run.id)}
                      type="button"
                    >
                      <strong>{run.promptVersion.text}</strong>
                      <span>
                        {run.modelConfigVersion.modelConfig.displayName} ·{" "}
                        {truncated
                          ? "回答不完整"
                          : target && parsed
                            ? "已提及"
                            : parsed
                              ? "未提及"
                              : jobStatusLabel(run.status)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="yc-meta yc-answer-empty">
                  没有符合筛选条件的回答。
                </p>
              )}
            </section>
            <section aria-label="回答详情" className="yc-answer-detail yc-card">
              {selected ? (
                <>
                  <div className="yc-section-heading">
                    <div>
                      <h2>{selected.promptVersion.text}</h2>
                      <p>
                        {selected.modelConfigVersion.modelConfig.displayName}
                        {selected.completedAt
                          ? ` · ${formatDateTime(selected.completedAt)}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        selected.result?.finishReason === "length"
                          ? "warning"
                          : selected.parseResult?.validSample &&
                              selected.mentions?.some(
                                (item) => item.kind === "target",
                              )
                            ? "success"
                            : "neutral"
                      }
                    >
                      {selected.result?.finishReason === "length"
                        ? "回答不完整"
                        : selected.parseResult?.validSample &&
                            selected.mentions?.some(
                              (item) => item.kind === "target",
                            )
                          ? "已提及"
                          : selected.parseResult?.validSample
                            ? "未提及"
                            : "未得出结论"}
                    </StatusBadge>
                  </div>
                  {selected.result?.finishReason === "length" && (
                    <StatePanel
                      description="回答未完整，本条不计入评分。请缩小问题范围后重试。"
                      title="回答不完整"
                      tone="stale"
                    />
                  )}
                  {(selected.parseResult?.validSample ? selected.mentions : [])
                    ?.filter((item) => item.kind === "target")
                    .map((item, index) => (
                      <p
                        className="yc-inline-note"
                        key={`${item.rawName}-${index}`}
                      >
                        <strong>
                          {item.rawName}
                          {item.rank ? ` · 排名 ${item.rank}` : ""}
                        </strong>
                        <span>
                          {item.evidenceSnippet} · 识别置信度 {item.confidence}
                        </span>
                      </p>
                    ))}
                  <h3>模型回答</h3>
                  {selected.result?.responseText ? (
                    <div className="yc-answer-text">
                      {selected.result.responseText}
                    </div>
                  ) : (
                    <StatePanel
                      description={
                        selected.result?.responsePurgedAt
                          ? "正文已按数据保留规则清理。"
                          : "本次运行未返回回答。"
                      }
                      title="回答正文不可查看"
                    />
                  )}
                  <h3>参考资料</h3>
                  {selected.result?.citations?.length ? (
                    <ol className="yc-answer-citations">
                      {selected.result.citations.map((citation, index) => {
                        const href = safeExternalUrl(citation.url);
                        return (
                          <li key={`${citation.url}-${index}`}>
                            {href ? (
                              <a
                                href={href}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                {citation.title || href}
                              </a>
                            ) : (
                              citation.title || "无效来源链接"
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="yc-meta">模型未返回引用链接。</p>
                  )}
                </>
              ) : (
                <p className="yc-meta">选择一条回答。</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function safeExternalUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
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
      <PageHeader metadata="不同评分版本的结果不合并趋势" title="历史报告" />
      {error ? (
        <StatePanel description={error} title="无法加载报告" tone="error" />
      ) : reportRows.length === 0 ? (
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/reports`)}>
              发起第一次分析
            </Button>
          }
          description="完成首次分析后可查看报告。"
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
                `${formatScore(row.contentSnapshot.overallScore)} / ${formatScore(row.contentSnapshot.confidence)}`,
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
                  {reportStatusLabel(row.status)}
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
      <PageHeader title="优化建议" />
      {!report ? (
        <StatePanel
          action={
            <Button onClick={() => navigate(`/projects/${project.id}/reports`)}>
              发起分析
            </Button>
          }
          description="完成首次分析后可查看建议。"
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
          description="本次报告暂无优化建议。"
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
                ) => recommendationPriorityLabel(row.priority),
              },
              {
                key: "title",
                label: "建议",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => (
                  <span>
                    <strong>
                      {recommendationTitle(row.title, row.category)}
                    </strong>
                    <small>
                      {recommendationDescription(row.description, row.category)}
                    </small>
                  </span>
                ),
              },
              {
                key: "impact",
                label: "影响",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => row.impact.replaceAll("Prompt", "分析问题"),
              },
              {
                key: "effort",
                label: "投入",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => recommendationEffortLabel(row.effort),
              },
              {
                key: "task",
                label: "操作",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => (
                  <Button
                    intent="ghost"
                    onClick={() =>
                      navigate(
                        `/projects/${project.id}/optimization-tasks?${new URLSearchParams({ title: recommendationTitle(row.title, row.category), description: recommendationDescription(row.description, row.category), baseline: report.contentSnapshot.analysisJobId })}`,
                      )
                    }
                  >
                    创建任务
                  </Button>
                ),
              },
              {
                key: "category",
                label: "类别",
                render: (
                  row: ReportVersionResponse["recommendations"][number],
                ) => scoreDimensionLabel(row.category),
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

function ProjectAssistant({
  onProject,
}: {
  readonly onProject: (project: ProjectResponse) => void;
}) {
  const { project, loading, error: projectError } = useProject(onProject);
  const [question, setQuestion] = useState("");
  const [runs, setRuns] = useState<readonly BrandAssistantRunResponse[]>();
  const [runsLoaded, setRunsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const projectId = project?.id;
  const load = useCallback(async () => {
    if (!projectId) return;
    setRunsLoaded(false);
    try {
      setRuns(
        await api.request<readonly BrandAssistantRunResponse[]>(
          `/projects/${projectId}/assistant/runs`,
          {},
          { cache: false },
        ),
      );
      setError(undefined);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setRunsLoaded(true);
    }
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    const timer = globalThis.setTimeout(() => void load(), 0);
    return () => globalThis.clearTimeout(timer);
  }, [load, projectId]);
  const ask = async () => {
    if (!project?.id || !question.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const run = await api.request<BrandAssistantRunResponse>(
        `/projects/${project.id}/assistant/runs`,
        {
          body: JSON.stringify({
            question: question.trim(),
            tokenBudget: 1500,
          }),
          method: "POST",
        },
      );
      setRuns((current) => [run, ...(current ?? [])]);
      setQuestion("");
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  };
  if (loading || (project && !runsLoaded)) return <Skeleton lines={7} />;
  if (projectError || !project)
    return (
      <StatePanel
        description={projectError ?? "项目不存在。"}
        title="无法打开品牌管家"
        tone="error"
      />
    );
  const suggestions = [
    "最新报告最值得关注的结论是什么？",
    "当前品牌相对竞品有哪些优势和短板？",
    "下一步应该优先优化哪些问题？",
  ] as const;
  return (
    <>
      <PageHeader title="品牌管家" />
      {error && (
        <StatePanel description={error} title="问答暂时不可用" tone="error" />
      )}
      <section className="yc-card yc-section-card yc-form-card">
        <FormField hint="仅使用本项目资料回答。" label="向品牌管家提问">
          <textarea
            maxLength={2000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：最新报告里最需要优先处理的问题是什么？"
            rows={4}
            value={question}
          />
        </FormField>
        <div className="yc-actions">
          {suggestions.map((suggestion) => (
            <Button
              intent="ghost"
              key={suggestion}
              onClick={() => setQuestion(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
        <Button disabled={busy || !question.trim()} onClick={() => void ask()}>
          {busy ? "正在分析…" : "发送问题"}
        </Button>
      </section>
      {runs?.length === 0 ? (
        <StatePanel
          description="输入问题，开始查询。"
          title="开始了解你的品牌"
        />
      ) : (
        runs?.map((run) => {
          const uncertainty = run.contextSnapshot.uncertainty;
          return (
            <section className="yc-card yc-section-card" key={run.id}>
              <div className="yc-section-heading">
                <div>
                  <h2>{run.question}</h2>
                  <p>{formatDateTime(run.createdAt)}</p>
                </div>
                <StatusBadge
                  tone={
                    run.status === "succeeded"
                      ? uncertainty?.level === "high"
                        ? "warning"
                        : "success"
                      : "danger"
                  }
                >
                  {run.status === "succeeded" ? "已回答" : "回答失败"}
                </StatusBadge>
              </div>
              <p>{run.answer ?? run.errorCode ?? "当前没有可展示的回答。"}</p>
              <div className="yc-inline-note">
                <strong>
                  不确定性：{uncertaintyLevel(uncertainty?.level)}
                </strong>
                <span>{uncertainty?.message ?? "未提供结果限制说明。"}</span>
              </div>
              <ul className="yc-plain-list">
                <li>
                  <span>
                    <strong>报告数据时间</strong>
                    <small>
                      {run.contextSnapshot.sourceGeneratedAt
                        ? formatDateTime(run.contextSnapshot.sourceGeneratedAt)
                        : "暂无报告"}
                    </small>
                  </span>
                </li>
                <li>
                  <span>
                    <strong>数据查询时间</strong>
                    <small>
                      {run.contextSnapshot.sampledAt
                        ? formatDateTime(run.contextSnapshot.sampledAt)
                        : formatDateTime(run.createdAt)}
                    </small>
                  </span>
                </li>
                {run.citations.map((citation) => (
                  <li key={citation.citation}>
                    <span>
                      <strong>{citation.label}</strong>
                      <small>
                        {citation.citation} ·{" "}
                        {formatDateTime(citation.observedAt)}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
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
          <strong>{formatScore(report.contentSnapshot.overallScore)}</strong>
          <span>总分</span>
        </article>
        <article>
          <strong>{formatScore(report.contentSnapshot.confidence)}</strong>
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
          </div>
          <StatusBadge
            tone={report.status === "published" ? "success" : "neutral"}
          >
            {reportStatusLabel(report.status)}
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
              label: "分析问题",
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
                  {jobStatusLabel(row.status)}
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
                    {recommendationPriorityLabel(item.priority)} ·{" "}
                    {recommendationTitle(item.title, item.category)}
                  </strong>
                  <small>
                    {recommendationDescription(item.description, item.category)}
                  </small>
                </span>
                <span className="yc-meta">
                  影响 {item.impact.replaceAll("Prompt", "分析问题")} · 投入{" "}
                  {recommendationEffortLabel(item.effort)}
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
      <PageHeader title="项目设置" />
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
          <p className="yc-meta">归档后停止新操作，历史报告和数据保留。</p>
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
      <PageHeader metadata="排除后不再推荐此竞品" title="竞品池" />
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
                  {competitorStatusLabel(row.status)}
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
          description="分析后可查看识别到的竞品。"
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

function jobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    cancelled: "已取消",
    completed: "已完成",
    failed: "失败",
    outcome_unknown: "结果待确认",
    partially_completed: "部分完成",
    queued: "排队中",
    running: "运行中",
    skipped: "已跳过",
    succeeded: "成功",
  };
  return labels[status] ?? "未知状态";
}

function reportStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    archived: "已归档",
    draft: "草稿",
    failed: "生成失败",
    generating: "生成中",
    published: "已发布",
    ready: "待发布",
  };
  return labels[status] ?? "未知状态";
}

function invitationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "已接受",
    active: "待接受",
    expired: "已过期",
    revoked: "已撤销",
  };
  return labels[status] ?? "未知状态";
}

function competitorStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    candidate: "待确认",
    confirmed: "已确认",
    excluded: "已排除",
    merged: "已合并",
  };
  return labels[status] ?? "未知状态";
}

function sourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    official_social: "官方社交账号",
    official_website: "官方网站",
    other: "其他公开来源",
    public_profile: "公开资料页",
  };
  return labels[type] ?? "其他公开来源";
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "管理员",
    analyst: "分析师",
    editor: "编辑者",
    member: "成员",
    operator: "运营",
    owner: "所有者",
    viewer: "查看者",
  };
  return labels[role] ?? "自定义角色";
}

function promptCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    alternative: "替代方案",
    brand_awareness: "品牌认知",
    comparison: "品牌对比",
    factual: "事实信息",
    location: "位置发现",
    nearby: "附近推荐",
    price: "价格",
    product_or_service: "产品与服务",
    recommendation: "品牌推荐",
    scenario: "使用场景",
    store_specific: "指定门店",
    trust: "口碑与信任",
  };
  return labels[category] ?? "其他";
}

function promptScopeLabel(scope: string): string {
  const labels: Record<string, string> = {
    city: "城市",
    country: "国家",
    district: "区县",
    global: "不限地区",
    nearby: "附近",
    province: "省份",
    store: "门店",
  };
  return labels[scope] ?? "其他范围";
}

function usageEntryTypeLabel(entryType: string): string {
  const labels: Record<string, string> = {
    adjustment: "额度调整",
    debit: "实际扣减",
    grant: "额度增加",
    release: "释放预留",
    reservation: "额度预留",
  };
  return labels[entryType] ?? "其他变动";
}

function usageSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    analysis_actual_cost: "分析实际用量",
    analysis_estimate: "分析预估",
    analysis_job: "分析任务",
    analysis_reservation_release: "分析任务结算",
    test_grant: "系统发放",
  };
  return labels[source] ?? "系统记录";
}

function scoreDimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    competitive_position: "竞争位置",
    consistency: "模型一致性",
    factual_accuracy: "事实准确度",
    mention_rate: "品牌提及率",
    model_coverage: "模型覆盖率",
    prompt_coverage: "问题覆盖率",
    ranking_strength: "推荐排名",
    recommendation_rate: "推荐率",
  };
  return labels[dimension] ?? "综合表现";
}

function recommendationPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    P0: "高优先级",
    P1: "中优先级",
    P2: "低优先级",
    P3: "可选优化",
  };
  return labels[priority] ?? "待评估";
}

function recommendationEffortLabel(effort: string): string {
  const labels: Record<string, string> = {
    high: "较高",
    low: "较低",
    medium: "中等",
  };
  return labels[effort] ?? "待评估";
}

function confidenceLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    high: "高",
    low: "低",
    medium: "中",
  };
  return labels[level] ?? "待评估";
}

function recommendationTitle(title: string, category: string): string {
  return title.replace(category, scoreDimensionLabel(category));
}

function recommendationDescription(
  description: string,
  category: string,
): string {
  return description.replaceAll(category, scoreDimensionLabel(category));
}

function formatDateTime(value: string): string {
  return `${new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value))}（北京时间）`;
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
      <PageHeader title="用量与额度" />
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
                    usageEntryTypeLabel(row.entryType),
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
                  render: (row: UsageResponse["entries"][number]) =>
                    usageSourceLabel(row.source),
                },
                {
                  key: "time",
                  label: "时间",
                  render: (row: UsageResponse["entries"][number]) =>
                    formatDateTime(row.createdAt),
                  secondary: true,
                },
              ]}
              rows={usage.entries}
            />
          ) : (
            <StatePanel
              description="额度发放和分析扣减会记录在这里。"
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

function uncertaintyLevel(level?: "low" | "medium" | "high"): string {
  return level === "low" ? "低" : level === "medium" ? "中" : "高";
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
    active: "已启用",
    archived: "已归档",
    confirmed: "品牌已确认",
    draft: "草稿",
    identifying: "识别中",
    ready: "品牌已确认",
    rejected: "已停用",
    unavailable: "不可用",
    waiting_confirmation: "待确认",
  };
  return <StatusBadge tone={tone}>{labels[status] ?? "未知状态"}</StatusBadge>;
}

function onboardingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    confirmed: "已确认",
    identifying: "识别中",
    needs_confirmation: "待确认",
    ready: "已就绪",
  };
  return labels[status] ?? "处理中";
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
        description="请检查地址或返回工作台。"
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
