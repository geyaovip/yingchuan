import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  FileText,
  MagnifyingGlass,
  Pulse,
  Quotes,
  ShieldCheck,
  Target,
} from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";

import { capabilities, productUrl, workflow } from "./content";

const modelRows = [
  {
    model: "豆包",
    score: 78,
    tendency: "高",
    completeness: 4,
    confidence: "± 6%",
  },
  {
    model: "Kimi",
    score: 72,
    tendency: "中高",
    completeness: 4,
    confidence: "± 7%",
  },
  {
    model: "GLM",
    score: 64,
    tendency: "中",
    completeness: 3,
    confidence: "± 8%",
  },
  {
    model: "DeepSeek",
    score: 58,
    tendency: "中",
    completeness: 3,
    confidence: "± 9%",
  },
] as const;

const workflowIcons: ReactNode[] = [
  <MagnifyingGlass key="search" />,
  <Target key="target" />,
  <Pulse key="pulse" />,
  <FileText key="report" />,
];

function Wordmark() {
  return (
    <span className="wordmark-text" aria-label="映川">
      映川
    </span>
  );
}

function Arrow() {
  return <ArrowRight aria-hidden="true" />;
}

export function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>

      <header className="site-header">
        <a className="wordmark" href="/" aria-label="映川首页">
          <Wordmark />
        </a>
        <nav aria-label="主导航">
          <a href="#capabilities">产品能力</a>
          <a href="#workflow">分析路径</a>
          <a href="#evidence">证据体系</a>
        </nav>
        <a className="header-action" href={productUrl}>
          进入工作台
          <Arrow />
        </a>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">品牌 AI 可见度 / 实时分析</p>
            <h1 id="hero-title">
              看见 AI
              <br />
              如何看见
              <br />
              你的品牌
            </h1>
            <p className="hero-intro">
              映川持续检测主流大模型如何理解、提及和推荐你的品牌，
              用可追溯证据定位认知差距，把每个结论变成可执行的增长动作。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href={productUrl}>
                开始品牌检测
                <Arrow />
              </a>
              <a className="button button-quiet" href="#workflow">
                查看分析路径
                <Arrow />
              </a>
            </div>
            <ul className="trust-list" aria-label="产品保障">
              <li>
                <ShieldCheck aria-hidden="true" />
                证据可追溯
              </li>
              <li>
                <CheckCircle aria-hidden="true" />
                结果可复现
              </li>
              <li>
                <ChartLineUp aria-hidden="true" />
                建议可执行
              </li>
            </ul>
          </div>

          <div className="hero-data" aria-label="多模型品牌可见度示例">
            <div className="data-head">
              <div>
                <p>多模型品牌可见度</p>
                <span>示例数据 · 最近一次检测</span>
              </div>
              <span className="live-state">
                <i aria-hidden="true" />
                ANALYSIS READY
              </span>
            </div>

            <div className="data-labels" aria-hidden="true">
              <span>模型</span>
              <span>可见度</span>
              <span>推荐倾向</span>
              <span>信息完整度</span>
              <span>置信区间</span>
            </div>

            <div className="model-table">
              {modelRows.map((row) => (
                <div className="model-row" key={row.model}>
                  <strong>{row.model}</strong>
                  <div className="score-cell">
                    <span>{row.score} / 100</span>
                    <i
                      aria-hidden="true"
                      style={{ "--score": `${row.score}%` } as CSSProperties}
                    />
                  </div>
                  <span>{row.tendency}</span>
                  <span
                    className="dot-score"
                    aria-label={`${row.completeness} / 5`}
                  >
                    {[1, 2, 3, 4, 5].map((dot) => (
                      <i
                        className={dot <= row.completeness ? "is-on" : ""}
                        key={dot}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                  <span>{row.confidence}</span>
                </div>
              ))}
            </div>

            <div className="trend-panel">
              <div>
                <span>整体可见度</span>
                <strong>68</strong>
                <small>/ 100</small>
              </div>
              <div className="trend-bars" aria-label="近五轮检测持续提升">
                {[34, 48, 42, 61, 68].map((height, index) => (
                  <i
                    key={height}
                    style={{ "--height": `${height}%` } as CSSProperties}
                    aria-hidden="true"
                  >
                    <span>{`0${index + 1}`}</span>
                  </i>
                ))}
              </div>
              <p>
                较上一轮 <strong>↑ 7</strong>
                <span>样本 80 · 有效回答 74</span>
              </p>
            </div>
          </div>
        </section>

        <section className="capability-section" id="capabilities">
          <div className="section-intro">
            <p className="section-label">01 / 产品能力</p>
            <h2>从 AI 认知，走到增长行动</h2>
          </div>
          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article key={capability.index}>
                <span>{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
                <a href="#evidence">
                  了解更多
                  <Arrow />
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-heading">
            <p className="section-label">02 / 分析路径</p>
            <div>
              <h2>四步获得第一份品牌 AI 认知报告</h2>
              <p>复杂的模型调用、解析和证据整理，由映川收进一条透明流程。</p>
            </div>
          </div>
          <ol className="workflow-list">
            {workflow.map(([title, description], index) => (
              <li key={title}>
                <span className="workflow-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="workflow-icon" aria-hidden="true">
                  {workflowIcons[index]}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="evidence-section" id="evidence">
          <div className="evidence-copy">
            <p className="section-label">03 / 证据体系 · 示例数据</p>
            <h2>先展示证据，再给结论</h2>
            <p>
              每次检测都保留问题、回答、模型、时间与来源。
              你看到的不只是一个漂亮分数，而是能被团队复核的决策依据。
            </p>
            <dl>
              <div>
                <dt>74</dt>
                <dd>本轮有效回答</dd>
              </div>
              <div>
                <dt>93%</dt>
                <dd>证据可追溯比例</dd>
              </div>
              <div>
                <dt>4</dt>
                <dd>参与检测模型</dd>
              </div>
            </dl>
          </div>

          <div className="evidence-view">
            <div className="evidence-tabs" aria-label="模型回答示例">
              <span className="is-active">豆包</span>
              <span>Kimi</span>
              <span>GLM</span>
              <span>DeepSeek</span>
            </div>
            <div className="question-block">
              <Quotes aria-hidden="true" />
              <div>
                <span>用户问题</span>
                <strong>有哪些值得信赖的品牌 AI 可见度分析工具？</strong>
              </div>
              <p className="evidence-score">
                <span>可见度评分</span>
                <strong>78</strong> / 100
              </p>
            </div>
            <div className="answer-block">
              <span>模型回答 · 节选</span>
              <p>
                映川聚焦品牌在 AI 问答中的认知表现，能够跨模型检测品牌提及、
                推荐倾向和事实完整度，并保留可回溯的证据链。
              </p>
            </div>
            <div className="source-list">
              <span>引用来源</span>
              <ol>
                <li>
                  <strong>01</strong>
                  品牌官网 · 产品能力说明
                  <span>已验证</span>
                </li>
                <li>
                  <strong>02</strong>
                  行业报告 · AI 搜索趋势
                  <span>已验证</span>
                </li>
                <li>
                  <strong>03</strong>
                  公开评测 · 品牌认知对比
                  <span>已验证</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <p className="section-label">START / 开始检测</p>
          <div>
            <h2>让 AI 的认知，成为你的增长起点</h2>
            <a className="button button-light" href={productUrl}>
              开始品牌检测
              <Arrow />
            </a>
          </div>
        </section>
      </main>

      <footer>
        <a className="wordmark" href="/" aria-label="映川首页">
          <Wordmark />
        </a>
        <p>AI 品牌可见度分析与持续运营管理平台</p>
        <a href={productUrl}>用户工作台</a>
        <span>© {new Date().getFullYear()} 映川</span>
      </footer>
    </div>
  );
}
