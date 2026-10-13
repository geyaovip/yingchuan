import { ApiError } from "@yingchuan/api-client";
import {
  Button,
  FormField,
  PageHeader,
  ResponsiveData,
  Skeleton,
  StatePanel,
} from "@yingchuan/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import "./monitoring.css";

interface Metrics {
  validSamples: number;
  invalidSamples: number;
  mentionRate: number | null;
  recommendationRate: number | null;
  averageRank: number | null;
  rankSamples: number;
}
interface Evidence {
  jobId: string;
  runId: string;
}
interface MetricRow extends Metrics {
  id: string;
  name: string;
  evidence?: Evidence[];
}
interface Trend extends Metrics {
  jobId: string;
  at: string;
  cohort: string;
  diagnosticOnly: boolean;
  score: number | null;
  scoreVersion: string | null;
}
interface Citation {
  domain: string;
  count: number;
  modelCounts: Record<string, number>;
  evidence: Evidence[];
  url?: string;
  title?: string;
}
interface Insights {
  summary: Metrics;
  timezone: string;
  options: {
    models: { id: string; name: string }[];
    prompts: { id: string; text: string }[];
    groups: string[];
  };
  models: MetricRow[];
  prompts: MetricRow[];
  groups: MetricRow[];
  competitors: MetricRow[];
  trends: Trend[];
  citations: { domains: Citation[]; articles: Citation[] };
}
interface Execution {
  id: string;
  dueAt: string;
  status: string;
  errorCode: string | null;
  analysisJobId: string | null;
  attempts: number;
  analysisJob?: { status: string } | null;
}
interface Schedule {
  id: string;
  name: string;
  active: boolean;
  version: number;
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
  weekday: number;
  timezone: string;
  maxCostMicros: string;
  nextRunAt: string;
  promptIds: string[];
  modelConfigIds: string[];
  executions: Execution[];
}
interface Settings {
  timezone: string;
  schedules: Schedule[];
  prompts: { id: string; text: string; groupKey: string | null }[];
  models: { id: string; name: string; nativeWebSearch: boolean }[];
  members: { id: string; displayEmail: string }[];
  jobs: { id: string; createdAt: string; status: string; totalRuns: number }[];
  permissions: string[];
}
interface Estimate {
  estimatedCostMicros: string;
  eligibleRunCount: number;
  skippedRunCount: number;
}
interface Retest {
  id: string;
  analysisJobId: string;
  createdAt: string;
  status: string;
  comparable: boolean;
  score: number | null;
  delta: number | null;
}
interface Task {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "done";
  baselineJobId: string;
  baselineScore: number | null;
  baselineJob: { createdAt: string };
  dueAt: string | null;
  evidenceUrl: string | null;
  assigneeId: string | null;
  assignee: { displayEmail: string } | null;
  version: number;
  retests: Retest[];
}
const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "加载失败，请稍后重试。";
const percent = (value: number | null) => (value === null ? "—" : `${value}%`);
const money = (micros: string) =>
  `¥${(Number(micros) / 1_000_000).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
const labels: Record<string, string> = {
  open: "待处理",
  in_progress: "进行中",
  done: "已完成",
  pending: "待提交",
  running: "执行中",
  submitted: "已提交",
  skipped: "未执行",
  dead_letter: "执行失败",
  queued: "排队中",
  completed: "已完成",
  partially_completed: "部分完成",
  failed: "失败",
  cancelled: "已取消",
};
const reasons: Record<string, string> = {
  RESOURCE_NOT_FOUND: "创建者权限已变更",
  PROJECT_NOT_READY: "项目未就绪",
  MONITORING_PAUSED: "计划已暂停",
  MONITORING_SELECTION_UNAVAILABLE: "问题或模型已停用",
  MONITORING_BUDGET_EXCEEDED: "预计费用超过上限",
  ANALYSIS_QUOTA_INSUFFICIENT: "可用额度不足",
  ANALYSIS_HAS_NO_ELIGIBLE_RUNS: "没有可执行的组合",
  MONITORING_SUBMISSION_FAILED: "提交失败",
};
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function date(value: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
function MetricsCards({ metrics }: { metrics: Metrics }) {
  return (
    <div className="yc-metric-grid">
      <article>
        <strong>{percent(metrics.mentionRate)}</strong>
        <span>品牌提及率</span>
      </article>
      <article>
        <strong>{percent(metrics.recommendationRate)}</strong>
        <span>品牌推荐率</span>
      </article>
      <article>
        <strong>{metrics.averageRank ?? "—"}</strong>
        <span>平均排名 · {metrics.rankSamples} 条明确排名</span>
      </article>
      <article>
        <strong>{metrics.validSamples}</strong>
        <span>有效回答 · {metrics.invalidSamples} 条未纳入</span>
      </article>
    </div>
  );
}
function EvidenceLinks({
  projectId,
  rows = [],
}: {
  projectId: string;
  rows?: Evidence[];
}) {
  return (
    <span className="yc-evidence-links">
      {rows.map((row, i) => (
        <Link
          key={row.runId}
          to={`/projects/${projectId}/answers?jobId=${row.jobId}&runId=${row.runId}`}
        >
          回答 {i + 1}
        </Link>
      ))}
    </span>
  );
}
function ErrorPanel({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <StatePanel
      title="操作未完成"
      description={message}
      tone="error"
      action={
        retry && (
          <Button intent="secondary" onClick={retry}>
            重试
          </Button>
        )
      }
    />
  );
}

export function InsightSummary({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Insights>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void api
      .request<Insights>(`/projects/${projectId}/insights?days=7`)
      .then((value) => {
        if (active) {
          setData(value);
          setError(undefined);
        }
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  return (
    <section className="yc-insight-summary">
      <div className="yc-section-heading">
        <h2>近 7 天品牌表现</h2>
        <Link to={`/projects/${projectId}/insights`}>查看数据洞察</Link>
      </div>
      {error ? (
        <ErrorPanel message={error} />
      ) : data ? (
        <MetricsCards metrics={data.summary} />
      ) : (
        <Skeleton lines={2} />
      )}
    </section>
  );
}

export function InsightsPage({ projectId }: { projectId: string }) {
  const [days, setDays] = useState("30"),
    [model, setModel] = useState(""),
    [prompt, setPrompt] = useState(""),
    [group, setGroup] = useState("");
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<Insights>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(undefined);
    const query = new URLSearchParams({ days });
    if (model) query.set("modelId", model);
    if (prompt) query.set("promptId", prompt);
    if (group) query.set("group", group);
    try {
      const value = await api.request<Insights>(
        `/projects/${projectId}/insights?${query}`,
      );
      if (version === requestVersion.current) setData(value);
    } catch (caught) {
      if (version === requestVersion.current) setError(errorMessage(caught));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [projectId, days, model, prompt, group]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void load();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  const columns = [
    {
      key: "name",
      label: tab === "questions" ? "分析问题" : "名称",
      render: (row: MetricRow) => <strong>{row.name}</strong>,
    },
    {
      key: "valid",
      label: "有效回答",
      render: (row: MetricRow) => row.validSamples,
    },
    {
      key: "mention",
      label: "提及率",
      render: (row: MetricRow) => percent(row.mentionRate),
    },
    {
      key: "recommend",
      label: "推荐率",
      render: (row: MetricRow) => percent(row.recommendationRate),
    },
    {
      key: "rank",
      label: "平均排名",
      render: (row: MetricRow) => (
        <span>
          {row.averageRank ?? "—"}
          <small>{row.rankSamples} 条明确排名</small>
        </span>
      ),
    },
    {
      key: "evidence",
      label: "回答",
      render: (row: MetricRow) => (
        <EvidenceLinks projectId={projectId} rows={row.evidence} />
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="数据洞察"
        actions={
          <Button
            intent="secondary"
            disabled={loading}
            onClick={() => {
              void load();
            }}
          >
            刷新
          </Button>
        }
      />
      <div className="yc-insight-filters">
        <FormField label="统计时间">
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="90">近 90 天</option>
          </select>
        </FormField>
        <FormField label="模型">
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
          >
            <option value="">全部模型</option>
            {data?.options.models.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="问题分组">
          <select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setPrompt("");
            }}
          >
            <option value="">全部分组</option>
            {data?.options.groups.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </FormField>
        <FormField label="分析问题">
          <select
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          >
            <option value="">全部问题</option>
            {data?.options.prompts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.text}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <nav className="yc-insight-tabs" aria-label="洞察分类">
        {[
          ["overview", "品牌表现"],
          ["questions", "问题表现"],
          ["competitors", "竞品对比"],
          ["citations", "引用排行"],
        ].map(([id, label]) => (
          <button
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id!)}
            key={id}
          >
            {label}
          </button>
        ))}
      </nav>
      {error ? (
        <ErrorPanel
          message={error}
          retry={() => {
            void load();
          }}
        />
      ) : loading ? (
        <Skeleton lines={6} />
      ) : (
        data && (
          <>
            <MetricsCards metrics={data.summary} />
            {!data.summary.validSamples ? (
              <StatePanel
                title="暂无有效分析数据"
                description="完成分析后可查看品牌表现与引用来源。"
                action={
                  <Link to={`/projects/${projectId}/reports`}>
                    前往可见度分析
                  </Link>
                }
              />
            ) : (
              <>
                {tab === "overview" && (
                  <>
                    <TrendChart trends={data.trends} timezone={data.timezone} />
                    <section className="yc-monitor-section">
                      <h2>各模型表现</h2>
                      <ResponsiveData columns={columns} rows={data.models} />
                    </section>
                  </>
                )}
                {tab === "questions" && (
                  <>
                    <section className="yc-monitor-section">
                      <h2>各问题表现</h2>
                      <ResponsiveData
                        rows={data.prompts}
                        columns={[
                          ...columns.slice(0, -1),
                          {
                            key: "detail",
                            label: "操作",
                            render: (row: MetricRow) => (
                              <span className="yc-inline-actions">
                                <Button
                                  intent="ghost"
                                  onClick={() => setPrompt(row.id)}
                                >
                                  查看趋势
                                </Button>
                                <EvidenceLinks
                                  projectId={projectId}
                                  rows={row.evidence}
                                />
                              </span>
                            ),
                          },
                        ]}
                      />
                    </section>
                    <section className="yc-monitor-section">
                      <h2>各分组表现</h2>
                      <ResponsiveData columns={columns} rows={data.groups} />
                    </section>
                    {prompt && (
                      <TrendChart
                        trends={data.trends}
                        timezone={data.timezone}
                      />
                    )}
                  </>
                )}
                {tab === "competitors" && (
                  <section className="yc-monitor-section">
                    <div className="yc-section-heading">
                      <h2>品牌与已确认竞品</h2>
                      <Link to={`/projects/${projectId}/competitors`}>
                        管理竞品
                      </Link>
                    </div>
                    <ResponsiveData
                      columns={columns}
                      rows={[
                        { id: "target", name: "本品牌", ...data.summary },
                        ...data.competitors,
                      ]}
                    />
                    {!data.competitors.length && (
                      <p className="yc-muted">
                        确认竞品后可在同一组回答中对比表现。
                      </p>
                    )}
                  </section>
                )}
                {tab === "citations" && (
                  <CitationTables data={data} projectId={projectId} />
                )}
              </>
            )}
            <p className="yc-monitor-note">
              提及率、推荐率以有效回答为分母；平均排名仅统计明确编号。统计按{" "}
              {data.timezone} 展示。
            </p>
          </>
        )
      )}
    </>
  );
}
function TrendChart({
  trends,
  timezone,
}: {
  trends: Trend[];
  timezone: string;
}) {
  const cohorts = [...new Set(trends.map((point) => point.cohort))];
  const [selected, setSelected] = useState("");
  const current = cohorts.includes(selected) ? selected : cohorts.at(-1);
  const points = trends.filter((point) => point.cohort === current);
  const x = (i: number) =>
    points.length < 2 ? 300 : 35 + (i / (points.length - 1)) * 530;
  const y = (value: number) => 155 - value * 1.2;
  return (
    <section className="yc-card yc-monitor-section">
      <div className="yc-section-heading">
        <div>
          <h2>品牌提及趋势</h2>
          <p className="yc-muted">按相同问题、模型版本及联网配置分别查看。</p>
        </div>
        <FormField label="比较组">
          <select
            value={current ?? ""}
            onChange={(event) => setSelected(event.target.value)}
          >
            {cohorts.map((cohort, i) => (
              <option key={cohort} value={cohort}>
                配置 {i + 1} ·{" "}
                {trends.filter((point) => point.cohort === cohort).length}{" "}
                次分析
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <svg
        viewBox="0 0 600 190"
        className="yc-trend-chart"
        role="img"
        aria-label="同配置品牌提及率趋势，详细数值见下方表格"
      >
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line
              x1="35"
              x2="565"
              y1={y(value)}
              y2={y(value)}
              stroke="var(--yc-border)"
            />
            <text
              x="0"
              y={y(value) + 4}
              fill="var(--yc-text-muted)"
              fontSize="11"
            >
              {value}%
            </text>
          </g>
        ))}
        {points.map((point, i) => (
          <g key={point.jobId}>
            {i > 0 &&
              point.mentionRate !== null &&
              points[i - 1]!.mentionRate !== null &&
              !point.diagnosticOnly &&
              !points[i - 1]!.diagnosticOnly && (
                <line
                  x1={x(i - 1)}
                  x2={x(i)}
                  y1={y(points[i - 1]!.mentionRate!)}
                  y2={y(point.mentionRate)}
                  stroke="#6e5ce6"
                  strokeWidth="2"
                />
              )}
            {point.mentionRate !== null && (
              <circle
                cx={x(i)}
                cy={y(point.mentionRate)}
                r="4"
                fill={point.diagnosticOnly ? "#929baa" : "#6e5ce6"}
              >
                <title>
                  {date(point.at, timezone)}：{percent(point.mentionRate)}
                  {point.diagnosticOnly ? "（诊断样本）" : ""}
                </title>
              </circle>
            )}
            {(i === 0 || i === points.length - 1) && (
              <text
                x={x(i)}
                y="183"
                textAnchor="middle"
                fontSize="11"
                fill="var(--yc-text-muted)"
              >
                {date(point.at, timezone)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <details>
        <summary>查看分析明细 · {points.length} 次</summary>
        <ResponsiveData
          rows={points.map((point) => ({ ...point, id: point.jobId }))}
          columns={[
            {
              key: "at",
              label: "分析时间",
              render: (row) => (
                <Link to={`/analysis-jobs/${row.jobId}`}>
                  {date(row.at, timezone)}
                </Link>
              ),
            },
            {
              key: "rate",
              label: "提及率",
              render: (row) => percent(row.mentionRate),
            },
            {
              key: "recommend",
              label: "推荐率",
              render: (row) => percent(row.recommendationRate),
            },
            {
              key: "samples",
              label: "有效回答",
              render: (row) => row.validSamples,
            },
            {
              key: "type",
              label: "样本",
              render: (row) => (row.diagnosticOnly ? "诊断样本" : "正式样本"),
            },
          ]}
        />
      </details>
    </section>
  );
}
function CitationTables({
  data,
  projectId,
}: {
  data: Insights;
  projectId: string;
}) {
  const [kind, setKind] = useState("domains");
  const citations =
    kind === "domains" ? data.citations.domains : data.citations.articles;
  return (
    <section className="yc-monitor-section">
      <div className="yc-section-heading">
        <h2>引用来源</h2>
        <span className="yc-inline-actions">
          <Button
            intent={kind === "domains" ? "primary" : "secondary"}
            onClick={() => setKind("domains")}
          >
            域名
          </Button>
          <Button
            intent={kind === "articles" ? "primary" : "secondary"}
            onClick={() => setKind("articles")}
          >
            文章
          </Button>
        </span>
      </div>
      {!citations.length ? (
        <StatePanel
          title="暂无引用来源"
          description="本期有效回答未返回可用的网页引用。"
        />
      ) : (
        <ResponsiveData
          rows={citations.map((row) => ({ ...row, id: row.url ?? row.domain }))}
          columns={[
            {
              key: "source",
              label: kind === "domains" ? "域名" : "文章",
              render: (row) => (
                <span>
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noopener noreferrer">
                      {row.title || row.url}
                    </a>
                  ) : (
                    <strong>{row.domain}</strong>
                  )}
                  {row.url && <small>{row.domain}</small>}
                </span>
              ),
            },
            { key: "count", label: "引用回答数", render: (row) => row.count },
            ...data.options.models.map((model) => ({
              key: model.id,
              label: model.name,
              render: (row: Citation) => (
                <span
                  className={
                    (row.modelCounts[model.id] ?? 0) > 0
                      ? "yc-citation-count"
                      : "yc-muted"
                  }
                >
                  {row.modelCounts[model.id] ?? 0}
                </span>
              ),
            })),
            {
              key: "evidence",
              label: "引用证据",
              render: (row) => (
                <EvidenceLinks projectId={projectId} rows={row.evidence} />
              ),
            },
          ]}
        />
      )}
      <p className="yc-monitor-note">同一回答对同一来源计为一次引用。</p>
    </section>
  );
}

function useSettings(projectId: string) {
  const [data, setData] = useState<Settings>(),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.request<Settings>(`/projects/${projectId}/monitoring`));
      setError(undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void load();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  return { data, error, loading, load };
}
interface ScheduleDraft {
  name: string;
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
  weekday: number;
  promptIds: string[];
  modelConfigIds: string[];
  maxCostMicros: string;
}
export function MonitoringPage({ projectId }: { projectId: string }) {
  const { data, error, loading, load } = useSettings(projectId);
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState<string>(),
    [notice, setNotice] = useState("");
  const [editingSchedule, setEditingSchedule] = useState<Schedule>();
  const [draft, setDraft] = useState<ScheduleDraft>({
    name: "品牌日常监测",
    frequency: "daily",
    hour: 9,
    minute: 0,
    weekday: 1,
    promptIds: [],
    modelConfigIds: [],
    maxCostMicros: "10000000",
  });
  const [confirmation, setConfirmation] = useState<{
    draft: ScheduleDraft;
    estimate: Estimate;
  }>();
  const canManage = data?.permissions.includes("analysis.run");
  const change = (patch: Partial<ScheduleDraft>) => {
    setDraft((value) => ({ ...value, ...patch }));
    setConfirmation(undefined);
  };
  const toggle = (values: string[], id: string) =>
    values.includes(id)
      ? values.filter((value) => value !== id)
      : [...values, id];
  const start = (schedule?: Schedule) => {
    setEditingSchedule(schedule);
    setCreating(true);
    setConfirmation(undefined);
    change({
      ...(schedule
        ? {
            name: schedule.name,
            frequency: schedule.frequency,
            hour: schedule.hour,
            minute: schedule.minute,
            weekday: schedule.weekday,
            maxCostMicros: schedule.maxCostMicros,
          }
        : {}),
      promptIds:
        schedule?.promptIds ?? data?.prompts.map((row) => row.id) ?? [],
      modelConfigIds:
        schedule?.modelConfigIds ?? data?.models.map((row) => row.id) ?? [],
    });
    setActionError(undefined);
  };
  const estimate = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      const value = await api.request<Estimate>(
        `/projects/${projectId}/monitoring/estimate`,
        {
          method: "POST",
          body: JSON.stringify({
            promptIds: draft.promptIds,
            modelConfigIds: draft.modelConfigIds,
          }),
        },
      );
      if (!value.eligibleRunCount)
        throw new Error("所选组合没有可执行的分析。");
      if (BigInt(value.estimatedCostMicros) > BigInt(draft.maxCostMicros)) {
        setActionError("预计费用超过单次上限，请调整配置或上限。");
        return;
      }
      setConfirmation({ draft: { ...draft }, estimate: value });
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : errorMessage(caught),
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!confirmation) return;
    setBusy(true);
    setActionError(undefined);
    try {
      await api.request(
        `/projects/${projectId}/monitoring/schedules${editingSchedule ? `/${editingSchedule.id}` : ""}`,
        {
          method: editingSchedule ? "PATCH" : "POST",
          body: JSON.stringify(
            editingSchedule
              ? { ...confirmation.draft, version: editingSchedule.version }
              : confirmation.draft,
          ),
        },
      );
      setCreating(false);
      setConfirmation(undefined);
      setNotice(editingSchedule ? "监测计划已更新。" : "监测计划已创建。");
      await load();
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const setActive = async (row: Schedule) => {
    setBusy(true);
    setActionError(undefined);
    try {
      await api.request(
        `/projects/${projectId}/monitoring/schedules/${row.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ active: !row.active, version: row.version }),
        },
      );
      setNotice(row.active ? "计划已暂停。" : "计划已恢复。");
      await load();
    } catch (caught) {
      setActionError(errorMessage(caught));
      await load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="监测计划"
        actions={
          <span className="yc-inline-actions">
            <Button
              intent="secondary"
              disabled={busy || loading}
              onClick={() => {
                void load();
              }}
            >
              刷新
            </Button>
            {canManage && (
              <Button disabled={busy || loading} onClick={() => start()}>
                新建计划
              </Button>
            )}
          </span>
        }
      />
      {error && (
        <ErrorPanel
          message={error}
          retry={() => {
            void load();
          }}
        />
      )}
      {actionError && <ErrorPanel message={actionError} />}
      {notice && (
        <p role="status" className="yc-monitor-success">
          {notice}
        </p>
      )}
      {loading && !data ? (
        <Skeleton lines={5} />
      ) : (
        data && (
          <>
            {creating && (
              <section className="yc-card yc-monitor-section">
                <div className="yc-section-heading">
                  <h2>{editingSchedule ? "编辑监测计划" : "新建监测计划"}</h2>
                  <Button
                    intent="ghost"
                    disabled={busy}
                    onClick={() => {
                      setCreating(false);
                      setConfirmation(undefined);
                    }}
                  >
                    取消
                  </Button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void estimate();
                  }}
                >
                  <fieldset disabled={busy} className="yc-monitor-fieldset">
                    <div className="yc-form-row yc-form-row--two">
                      <FormField label="计划名称">
                        <input
                          required
                          maxLength={120}
                          value={draft.name}
                          onChange={(event) =>
                            change({ name: event.target.value })
                          }
                        />
                      </FormField>
                      <FormField label="频率">
                        <select
                          value={draft.frequency}
                          onChange={(event) =>
                            change({
                              frequency: event.target.value as
                                "daily" | "weekly",
                            })
                          }
                        >
                          <option value="daily">每日</option>
                          <option value="weekly">每周</option>
                        </select>
                      </FormField>
                      <FormField label={`执行时间 · ${data.timezone}`}>
                        <input
                          type="time"
                          required
                          value={`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`}
                          onChange={(event) => {
                            const [hour, minute] = event.target.value
                              .split(":")
                              .map(Number);
                            change({ hour, minute });
                          }}
                        />
                      </FormField>
                      {draft.frequency === "weekly" && (
                        <FormField label="执行日期">
                          <select
                            value={draft.weekday}
                            onChange={(event) =>
                              change({ weekday: Number(event.target.value) })
                            }
                          >
                            {weekdays.map((name, index) => (
                              <option key={name} value={index}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </FormField>
                      )}
                      <FormField label="单次费用上限（元）">
                        <input
                          required
                          type="number"
                          min="0.000001"
                          max="10000"
                          step="0.000001"
                          value={Number(draft.maxCostMicros) / 1_000_000 || ""}
                          onChange={(event) =>
                            change({
                              maxCostMicros: String(
                                Math.round(
                                  Number(event.target.value) * 1_000_000,
                                ),
                              ),
                            })
                          }
                        />
                      </FormField>
                    </div>
                    <div className="yc-monitor-choices">
                      <SelectionList
                        title="分析问题"
                        rows={data.prompts.map((row) => ({
                          id: row.id,
                          name: row.text,
                        }))}
                        values={draft.promptIds}
                        onChange={(values) => change({ promptIds: values })}
                        onToggle={(id) =>
                          change({ promptIds: toggle(draft.promptIds, id) })
                        }
                      />
                      <SelectionList
                        title="分析模型"
                        rows={data.models}
                        values={draft.modelConfigIds}
                        onChange={(values) =>
                          change({ modelConfigIds: values })
                        }
                        onToggle={(id) =>
                          change({
                            modelConfigIds: toggle(draft.modelConfigIds, id),
                          })
                        }
                      />
                    </div>
                    <p className="yc-monitor-note">
                      执行时使用所选问题与模型的最新版本；费用超过上限或额度不足时跳过。报告生成后发送站内通知。
                    </p>
                    <Button
                      type="submit"
                      disabled={
                        busy ||
                        !draft.promptIds.length ||
                        !draft.modelConfigIds.length
                      }
                    >
                      {busy ? "正在核算…" : "核算费用"}
                    </Button>
                  </fieldset>
                </form>
                {confirmation && (
                  <section className="yc-monitor-confirm" aria-label="创建确认">
                    <h3>{editingSchedule ? "确认修改" : "确认创建"}</h3>
                    <p>
                      {confirmation.draft.frequency === "daily"
                        ? "每日"
                        : `每${weekdays[confirmation.draft.weekday]}`}{" "}
                      {String(confirmation.draft.hour).padStart(2, "0")}:
                      {String(confirmation.draft.minute).padStart(2, "0")} ·{" "}
                      {data.timezone}
                    </p>
                    <p>
                      {confirmation.estimate.eligibleRunCount} 条回答，预计{" "}
                      {money(confirmation.estimate.estimatedCostMicros)} /
                      次，上限 {money(confirmation.draft.maxCostMicros)}。
                      {confirmation.estimate.skippedRunCount > 0 &&
                        ` ${confirmation.estimate.skippedRunCount} 个不支持联网的组合将跳过。`}
                    </p>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        void submit();
                      }}
                    >
                      {busy
                        ? "保存中…"
                        : editingSchedule
                          ? "保存修改"
                          : "创建计划"}
                    </Button>
                  </section>
                )}
              </section>
            )}
            {!data.schedules.length && !creating ? (
              <StatePanel
                title="暂无监测计划"
                action={
                  canManage && <Button onClick={() => start()}>新建计划</Button>
                }
              />
            ) : (
              data.schedules.map((row) => (
                <section className="yc-card yc-monitor-section" key={row.id}>
                  <div className="yc-section-heading">
                    <div>
                      <h2>
                        {row.name}{" "}
                        <span
                          className={`yc-monitor-chip ${row.active ? "is-active" : ""}`}
                        >
                          {row.active ? "运行中" : "已暂停"}
                        </span>
                      </h2>
                      <p className="yc-muted">
                        {row.frequency === "daily"
                          ? "每日"
                          : `每${weekdays[row.weekday]}`}{" "}
                        {String(row.hour).padStart(2, "0")}:
                        {String(row.minute).padStart(2, "0")} · {row.timezone}
                      </p>
                    </div>
                    {canManage && (
                      <span className="yc-inline-actions">
                        <Button
                          intent="secondary"
                          disabled={busy || loading}
                          onClick={() => start(row)}
                        >
                          编辑
                        </Button>
                        <Button
                          intent="secondary"
                          disabled={busy}
                          onClick={() => {
                            void setActive(row);
                          }}
                        >
                          {row.active ? "暂停" : "恢复"}
                        </Button>
                      </span>
                    )}
                  </div>
                  <div className="yc-monitor-plan-meta">
                    <span>
                      {row.promptIds.length} 个问题 ·{" "}
                      {row.modelConfigIds.length} 个模型
                    </span>
                    <span>单次上限 {money(row.maxCostMicros)}</span>
                    <span>
                      {row.active
                        ? `下次执行 ${date(row.nextRunAt, row.timezone)}`
                        : "暂停期间不新增分析"}
                    </span>
                  </div>
                  <details>
                    <summary>
                      执行记录 · 最近 {row.executions.length} 次
                    </summary>
                    {!row.executions.length ? (
                      <p className="yc-muted">尚未到首次执行时间。</p>
                    ) : (
                      <ResponsiveData
                        rows={row.executions}
                        columns={[
                          {
                            key: "date",
                            label: "计划时间",
                            render: (item) => date(item.dueAt, row.timezone),
                          },
                          {
                            key: "status",
                            label: "执行状态",
                            render: (item) =>
                              labels[item.status] ?? item.status,
                          },
                          {
                            key: "analysis",
                            label: "分析",
                            render: (item) =>
                              item.analysisJobId ? (
                                <Link
                                  to={`/analysis-jobs/${item.analysisJobId}`}
                                >
                                  {labels[
                                    item.analysisJob?.status ?? "queued"
                                  ] ?? "查看分析"}
                                </Link>
                              ) : (
                                (reasons[item.errorCode ?? ""] ??
                                (item.errorCode
                                  ? "提交失败，请联系管理员"
                                  : "—"))
                              ),
                          },
                        ]}
                      />
                    )}
                  </details>
                </section>
              ))
            )}
          </>
        )
      )}
    </>
  );
}
function SelectionList({
  title,
  rows,
  values,
  onChange,
  onToggle,
}: {
  title: string;
  rows: { id: string; name: string }[];
  values: string[];
  onChange: (ids: string[]) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="yc-monitor-selection">
      <legend>
        {title} · 已选 {values.length}
      </legend>
      <div className="yc-inline-actions">
        <button
          type="button"
          onClick={() => onChange(rows.map((row) => row.id))}
        >
          全选
        </button>
        <button type="button" onClick={() => onChange([])}>
          清空
        </button>
      </div>
      <div className="yc-monitor-selection-list">
        {rows.map((row) => (
          <label key={row.id}>
            <input
              type="checkbox"
              checked={values.includes(row.id)}
              onChange={() => onToggle(row.id)}
            />
            <span>{row.name}</span>
          </label>
        ))}
        {!rows.length && <p className="yc-muted">暂无可选{title}。</p>}
      </div>
    </fieldset>
  );
}

interface TaskDraft {
  title: string;
  description: string;
  baselineJobId: string;
  assigneeId: string;
  dueAt: string;
  evidenceUrl: string;
  status: Task["status"];
}
const emptyTask: TaskDraft = {
  title: "",
  description: "",
  baselineJobId: "",
  assigneeId: "",
  dueAt: "",
  evidenceUrl: "",
  status: "open",
};
function localInput(value: string | null) {
  if (!value) return "";
  const instant = new Date(value);
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
export function OptimizationTasksPage({ projectId }: { projectId: string }) {
  const {
    data: settings,
    error: settingsError,
    loading: settingsLoading,
    load: loadSettings,
  } = useSettings(projectId);
  const location = useLocation(),
    navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<"new" | Task>(),
    [draft, setDraft] = useState<TaskDraft>(emptyTask),
    [statusFilter, setStatusFilter] = useState("all");
  const [confirmation, setConfirmation] = useState<{
    task: Task;
    estimate: Estimate;
    key: string;
  }>();
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(
        await api.request<Task[]>(`/projects/${projectId}/optimization-tasks`),
      );
      setLoadedAt(Date.now());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void load();
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      const query = new URLSearchParams(location.search);
      if (query.get("title")) {
        setDraft({
          ...emptyTask,
          title: query.get("title") ?? "",
          description: query.get("description") ?? "",
          baselineJobId: query.get("baseline") ?? "",
        });
        setEditor("new");
      }
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [location.search]);
  const pending = tasks.some((task) =>
    task.retests.some((row) => ["queued", "running"].includes(row.status)),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = globalThis.setInterval(() => {
      void load();
    }, 10_000);
    return () => globalThis.clearInterval(timer);
  }, [pending, load]);
  const canManage = settings?.permissions.includes("optimization.manage"),
    canRetest = canManage && settings?.permissions.includes("analysis.run");
  const openTask = (task?: Task) => {
    setEditor(task ?? "new");
    setError(undefined);
    setDraft(
      task
        ? {
            title: task.title,
            description: task.description,
            baselineJobId: task.baselineJobId,
            assigneeId: task.assigneeId ?? "",
            evidenceUrl: task.evidenceUrl ?? "",
            dueAt: localInput(task.dueAt),
            status: task.status,
          }
        : { ...emptyTask, baselineJobId: settings?.jobs[0]?.id ?? "" },
    );
  };
  const close = () => {
    setEditor(undefined);
    if (location.search) void navigate(location.pathname, { replace: true });
  };
  const save = async () => {
    setBusy(true);
    setError(undefined);
    const input = {
      title: draft.title,
      description: draft.description,
      assigneeId: draft.assigneeId || null,
      evidenceUrl: draft.evidenceUrl || null,
      dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
    };
    try {
      await api.request(
        `/projects/${projectId}/optimization-tasks${editor && editor !== "new" ? `/${editor.id}` : ""}`,
        {
          method: editor === "new" ? "POST" : "PATCH",
          body: JSON.stringify(
            editor === "new"
              ? { ...input, baselineJobId: draft.baselineJobId }
              : { ...input, version: editor?.version, status: draft.status },
          ),
        },
      );
      close();
      setNotice("任务已保存。");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const prepareRetest = async (task: Task) => {
    setBusy(true);
    setError(undefined);
    setConfirmation(undefined);
    try {
      const estimate = await api.request<Estimate>(
        `/projects/${projectId}/monitoring/estimate`,
        {
          method: "POST",
          body: JSON.stringify({ sourceJobId: task.baselineJobId }),
        },
      );
      setConfirmation({ task, estimate, key: globalThis.crypto.randomUUID() });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const submitRetest = async () => {
    if (!confirmation) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.request(
        `/projects/${projectId}/optimization-tasks/${confirmation.task.id}/retests`,
        {
          method: "POST",
          headers: { "idempotency-key": confirmation.key },
          body: JSON.stringify({
            maxCostMicros: String(
              BigInt(confirmation.estimate.estimatedCostMicros) || 1n,
            ),
          }),
        },
      );
      setConfirmation(undefined);
      setNotice("复测已提交，完成后可在任务中查看结果。");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const filtered = tasks.filter(
    (task) => statusFilter === "all" || task.status === statusFilter,
  );
  return (
    <>
      <PageHeader
        title="优化任务"
        actions={
          <span className="yc-inline-actions">
            <Button
              intent="secondary"
              disabled={busy}
              onClick={() => {
                setError(undefined);
                void load();
                void loadSettings();
              }}
            >
              刷新
            </Button>
            {canManage && (
              <Button
                disabled={busy || !settings?.jobs.length}
                onClick={() => openTask()}
              >
                新建任务
              </Button>
            )}
          </span>
        }
      />
      {(error || settingsError) && (
        <ErrorPanel
          message={error ?? settingsError!}
          retry={() => {
            setError(undefined);
            void load();
            void loadSettings();
          }}
        />
      )}
      {notice && (
        <p role="status" className="yc-monitor-success">
          {notice}
        </p>
      )}
      {editor && settings && canManage && (
        <section className="yc-card yc-monitor-section">
          <div className="yc-section-heading">
            <h2>{editor === "new" ? "新建优化任务" : "编辑任务"}</h2>
            <Button intent="ghost" disabled={busy} onClick={close}>
              取消
            </Button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy} className="yc-monitor-fieldset">
              <div className="yc-form-row yc-form-row--two">
                <FormField label="任务名称">
                  <input
                    required
                    maxLength={200}
                    value={draft.title}
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </FormField>
                <FormField label="基线分析">
                  <select
                    required
                    value={draft.baselineJobId}
                    disabled={editor !== "new"}
                    onChange={(event) =>
                      setDraft({ ...draft, baselineJobId: event.target.value })
                    }
                  >
                    <option value="">选择分析</option>
                    {settings.jobs.map((row) => (
                      <option key={row.id} value={row.id}>
                        {date(row.createdAt, settings.timezone)} ·{" "}
                        {row.totalRuns} 条回答
                      </option>
                    ))}
                    {editor !== "new" &&
                      !settings.jobs.some(
                        (row) => row.id === draft.baselineJobId,
                      ) && (
                        <option value={draft.baselineJobId}>已关联基线</option>
                      )}
                  </select>
                </FormField>
                <FormField label="负责人">
                  <select
                    value={draft.assigneeId}
                    onChange={(event) =>
                      setDraft({ ...draft, assigneeId: event.target.value })
                    }
                  >
                    <option value="">未分配</option>
                    {settings.members.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.displayEmail}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  label={`截止时间 · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
                >
                  <input
                    type="datetime-local"
                    value={draft.dueAt}
                    onChange={(event) =>
                      setDraft({ ...draft, dueAt: event.target.value })
                    }
                  />
                </FormField>
                {editor !== "new" && (
                  <FormField label="任务状态">
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          status: event.target.value as Task["status"],
                        })
                      }
                    >
                      {["open", "in_progress", "done"].map((status) => (
                        <option key={status} value={status}>
                          {labels[status]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}
                <FormField label="证据链接（选填）">
                  <input
                    type="url"
                    maxLength={2000}
                    placeholder="https://"
                    value={draft.evidenceUrl}
                    onChange={(event) =>
                      setDraft({ ...draft, evidenceUrl: event.target.value })
                    }
                  />
                </FormField>
              </div>
              <FormField label="优化措施">
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                />
              </FormField>
              <Button type="submit" disabled={busy}>
                {busy ? "保存中…" : "保存任务"}
              </Button>
            </fieldset>
          </form>
        </section>
      )}
      {confirmation && (
        <section className="yc-card yc-monitor-confirm" aria-label="复测确认">
          <h2>确认复测</h2>
          <p>
            {confirmation.task.title} · {confirmation.estimate.eligibleRunCount}{" "}
            条回答 · 预计 {money(confirmation.estimate.estimatedCostMicros)}
          </p>
          <p>沿用基线的问题、模型版本、地域与联网配置。费用按实际调用结算。</p>
          <span className="yc-inline-actions">
            <Button
              disabled={busy}
              onClick={() => {
                void submitRetest();
              }}
            >
              {busy ? "提交中…" : "确认并提交"}
            </Button>
            <Button
              intent="secondary"
              disabled={busy}
              onClick={() => setConfirmation(undefined)}
            >
              取消
            </Button>
          </span>
        </section>
      )}
      <nav className="yc-insight-tabs" aria-label="任务状态">
        {[
          ["all", "全部"],
          ["open", "待处理"],
          ["in_progress", "进行中"],
          ["done", "已完成"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-current={statusFilter === id ? "page" : undefined}
            onClick={() => setStatusFilter(id!)}
          >
            {label}{" "}
            <span>
              {tasks.filter((row) => id === "all" || row.status === id).length}
            </span>
          </button>
        ))}
      </nav>
      {(loading || settingsLoading) && !settings ? (
        <Skeleton lines={6} />
      ) : !filtered.length ? (
        <StatePanel
          title={tasks.length ? "该状态下暂无任务" : "暂无优化任务"}
          description={
            !settings?.jobs.length
              ? "完成首次分析后可创建任务并关联基线。"
              : undefined
          }
          action={
            !settings?.jobs.length && (
              <Link to={`/projects/${projectId}/reports`}>前往可见度分析</Link>
            )
          }
        />
      ) : (
        filtered.map((task) => (
          <section key={task.id} className="yc-card yc-monitor-section">
            <div className="yc-section-heading">
              <div>
                <h2>
                  {task.title}{" "}
                  <span className="yc-monitor-chip">{labels[task.status]}</span>
                </h2>
                <p className="yc-muted">
                  {task.assignee?.displayEmail ?? "未分配负责人"}
                  {task.dueAt &&
                    ` · 截止 ${date(task.dueAt, settings?.timezone ?? "Asia/Shanghai")}`}
                  {task.dueAt &&
                    task.status !== "done" &&
                    new Date(task.dueAt).getTime() < loadedAt && (
                      <span className="yc-overdue"> · 已逾期</span>
                    )}
                </p>
              </div>
              <span className="yc-inline-actions">
                {canManage && (
                  <Button
                    intent="secondary"
                    disabled={busy}
                    onClick={() => openTask(task)}
                  >
                    编辑
                  </Button>
                )}
                {canRetest && (
                  <Button
                    disabled={
                      busy ||
                      task.retests.some((row) =>
                        ["queued", "running"].includes(row.status),
                      )
                    }
                    onClick={() => {
                      void prepareRetest(task);
                    }}
                  >
                    发起复测
                  </Button>
                )}
              </span>
            </div>
            <p className="yc-task-description">{task.description}</p>
            <div className="yc-inline-actions">
              <Link to={`/analysis-jobs/${task.baselineJobId}`}>
                查看基线 · {task.baselineScore ?? "—"} 分
              </Link>
              {task.evidenceUrl && (
                <a
                  href={task.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看优化证据
                </a>
              )}
            </div>
            {task.retests.length > 0 && (
              <div className="yc-retest-results">
                <h3>复测记录</h3>
                <ResponsiveData
                  rows={task.retests}
                  columns={[
                    {
                      key: "at",
                      label: "提交时间",
                      render: (row) =>
                        date(
                          row.createdAt,
                          settings?.timezone ?? "Asia/Shanghai",
                        ),
                    },
                    {
                      key: "status",
                      label: "状态",
                      render: (row) => labels[row.status] ?? row.status,
                    },
                    {
                      key: "score",
                      label: "复测评分",
                      render: (row) => row.score ?? "—",
                    },
                    {
                      key: "change",
                      label: "评分变化",
                      render: (row) =>
                        row.comparable && row.delta !== null
                          ? `${row.delta > 0 ? "+" : ""}${row.delta} 分`
                          : row.score !== null
                            ? "样本不足或结果不可比"
                            : "等待结果",
                    },
                    {
                      key: "report",
                      label: "分析",
                      render: (row) => (
                        <Link to={`/analysis-jobs/${row.analysisJobId}`}>
                          查看结果
                        </Link>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </section>
        ))
      )}
    </>
  );
}
