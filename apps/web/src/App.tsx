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
  readonly brandEntity?: { readonly canonicalName: string };
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

const mainNavigation: readonly NavigationItem[] = [
  { href: "/dashboard", label: "概览", marker: "⌂" },
  { href: "/projects", label: "项目", marker: "□" },
  { href: "/workspaces", label: "工作区", marker: "◇" },
  { href: "/notifications", label: "通知", marker: "○" },
  { href: "/usage", label: "用量", marker: "↗" },
  { href: "/team", label: "团队", marker: "◎" },
  { href: "/settings", label: "设置", marker: "·" },
];

export function App() {
  const [session, setSession] = useState<SessionView>();
  const previewMode =
    import.meta.env.DEV &&
    new URLSearchParams(globalThis.location.search).get("preview") === "shell";
  const [loading, setLoading] = useState(!previewMode);
  const previewSession = previewMode
    ? ({
        audience: "user",
        csrfToken: "development-preview",
        email: "preview@chatway.chat",
        expiresAt: "2099-01-01T00:00:00.000Z",
        userId: "development-preview",
      } satisfies SessionView)
    : undefined;
  useEffect(() => {
    if (previewMode) return;
    void api
      .getSession()
      .then(setSession)
      .catch(() => setSession(undefined))
      .finally(() => setLoading(false));
  }, [previewMode]);
  if (previewSession)
    return <AuthenticatedApp preview session={previewSession} />;
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

function AuthenticatedApp({
  preview = false,
  session,
}: {
  readonly preview?: boolean;
  readonly session: SessionView;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const previewWorkspace: WorkspaceResponse = {
    id: "019f87ef-0000-7000-8000-000000000001",
    memberships: [{ role: { code: "owner" } }],
    name: "演示工作区",
    slug: "preview-workspace",
    version: 1,
  };
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceResponse[]>(
    preview ? [previewWorkspace] : [],
  );
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(
    preview ? previewWorkspace.id : undefined,
  );
  const [loading, setLoading] = useState(!preview);
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
    if (preview) {
      api.selectWorkspace(previewWorkspace.id);
      return;
    }
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
  }, [applyWorkspaces, preview, previewWorkspace.id]);
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
          path="/projects/:projectId/sources"
          element={<ProjectSources onProject={setActiveProject} />}
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
          path="/projects/:projectId/competitors"
          element={<ProjectCompetitors onProject={setActiveProject} />}
        />
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
          path="*"
          element={<PagePlaceholder path={location.pathname} />}
        />
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
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={() => (globalThis.location.href = "/projects/new")}>
            创建项目
          </Button>
        }
        description="集中查看品牌项目、分析任务和需要处理的事项。"
        eyebrow="工作台"
        title="早上好"
      />
      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <StatePanel
          description={error}
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
        eyebrow="INBOX"
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
        eyebrow="账户"
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
        eyebrow="工作区"
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
        eyebrow="项目"
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
        eyebrow="项目初始化"
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
        eyebrow="项目概览"
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
        eyebrow="项目"
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
        eyebrow="项目"
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
        eyebrow="ANALYSIS"
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
              <StatusBadge tone={jobTone(selected.status)}>
                {selected.status}
              </StatusBadge>
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
        eyebrow="ENTITY REVIEW"
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
        eyebrow="USAGE"
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

function PagePlaceholder({ path }: { readonly path: string }) {
  const names: Record<string, string> = {
    "/notifications": "通知",
    "/settings": "设置",
    "/team": "团队",
    "/usage": "用量",
  };
  return (
    <>
      <PageHeader eyebrow="映川" title={names[path] ?? "页面"} />
      <StatePanel
        description="应用壳和权限边界已经就绪，该业务模块会在对应版本接入真实 API。"
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
