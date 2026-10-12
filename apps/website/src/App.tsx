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
import { useState, type CSSProperties, type ReactNode } from "react";

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
  const [activeModel, setActiveModel] = useState<(typeof modelRows)[number]>(
    modelRows[0],
  );
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
            <a className="hero-announcement" href="#capabilities">
              <span>产品介绍</span>
              了解映川的品牌 AI 可见度分析
              <Arrow />
            </a>
            <h1 id="hero-title">
              看清 AI 如何
              <br />
              <span>回答你的品牌</span>
            </h1>
            <p className="hero-intro">
              围绕真实用户问题，分析可用大模型如何理解、提及和推荐你的品牌。
              从模型回答和引用出发，定位认知差距与下一步行动。
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
                过程可复核
              </li>
              <li>
                <ChartLineUp aria-hidden="true" />
                建议可执行
              </li>
            </ul>
          </div>

          <div className="preview-frame">
            <div className="preview-toolbar" aria-hidden="true">
              <span className="preview-dots">
                <i />
                <i />
                <i />
              </span>
              <span>映川 · 品牌分析示意</span>
            </div>
            <div className="hero-data" aria-label="多模型品牌可见度示例">
              <div className="data-head">
                <div>
                  <p>多模型品牌可见度</p>
                  <span>界面示意 · 非真实检测结果</span>
                </div>
                <span className="live-state">
                  <i aria-hidden="true" />
                  示例报告
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
                <div className="trend-bars" aria-label="五轮示意分数">
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
            <p className="section-label">03 / 证据体系 · 界面示意</p>
            <h2>先展示证据，再给结论</h2>
            <p>
              分析结果记录问题、模型回答、时间与官方返回的引用。
              下面的数据和回答仅用于说明界面，不代表真实检测结果。
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
            <div
              className="evidence-tabs"
              role="group"
              aria-label="切换模型回答示意"
            >
              {modelRows.map((model) => (
                <button
                  aria-pressed={activeModel.model === model.model}
                  className={
                    activeModel.model === model.model ? "is-active" : ""
                  }
                  key={model.model}
                  onClick={() => setActiveModel(model)}
                  type="button"
                >
                  {model.model}
                </button>
              ))}
            </div>
            <div className="question-block" id="demo-answer">
              <Quotes aria-hidden="true" />
              <div>
                <span>用户问题</span>
                <strong>有哪些值得信赖的品牌 AI 可见度分析工具？</strong>
              </div>
              <p className="evidence-score">
                <span>可见度评分</span>
                <strong>{activeModel.score}</strong> / 100
              </p>
            </div>
            <div className="answer-block">
              <span>{activeModel.model} · 回答示意</span>
              <p>
                这个示意回答展示如何按模型查看品牌提及、推荐倾向和来源。
                正式报告以实际模型回答为准。
              </p>
            </div>
            <div className="source-list">
              <span>来源类型示意 · 非真实引用</span>
              <ol>
                <li>
                  <strong>01</strong>
                  品牌官网 · 产品能力说明
                  <span>示意</span>
                </li>
                <li>
                  <strong>02</strong>
                  行业报告 · AI 搜索趋势
                  <span>示意</span>
                </li>
                <li>
                  <strong>03</strong>
                  公开评测 · 品牌认知对比
                  <span>示意</span>
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
        <p>AI 品牌可见度分析平台</p>
        <a href={productUrl}>用户工作台</a>
        <span>© {new Date().getFullYear()} 映川</span>
      </footer>
    </div>
  );
}
