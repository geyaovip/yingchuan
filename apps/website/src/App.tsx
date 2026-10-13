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
import { useState, type ReactNode } from "react";

import { capabilities, productUrl, workflow } from "./content";

const reportSections = [
  {
    title: "模型回答",
    description: "按分析问题和模型查看回答原文，确认品牌是否被提及。",
    fields: ["分析问题", "模型与运行时间", "回答原文"],
  },
  {
    title: "提及与来源",
    description: "核对品牌提及、竞品候选及模型实际返回的引用。",
    fields: ["品牌提及", "竞品候选", "来源引用"],
  },
  {
    title: "评分与建议",
    description: "结合有效样本、置信度和限制说明阅读评分与优化建议。",
    fields: ["有效样本", "评分版本", "结果限制"],
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
  const [activeSection, setActiveSection] = useState<
    (typeof reportSections)[number]
  >(reportSections[0]);
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
              从用户提问出发，查看已启用模型如何描述和推荐你的品牌。
              每份报告都能回到模型回答、提及与来源，核对结论的依据。
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

          <div className="preview-frame" aria-label="映川分析流程">
            <div className="preview-toolbar">
              <span>映川分析流程</span>
              <span>从问题到依据</span>
            </div>
            <div className="hero-process">
              <div className="hero-process__heading">
                <span>一次分析，逐步看清</span>
                <strong>品牌在 AI 回答中的位置</strong>
              </div>
              <ol>
                <li>
                  <span>01</span>
                  <div>
                    <strong>确定分析范围</strong>
                    <p>确认品牌、用户提问和参与分析的模型。</p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>保留回答依据</strong>
                    <p>查看模型回答原文、品牌提及与返回的引用。</p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>形成分析报告</strong>
                    <p>结合有效样本和结果限制，安排下一步优化。</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="capability-section" id="capabilities">
          <div className="section-intro">
            <p className="section-label">产品能力</p>
            <h2>看清品牌被如何提及</h2>
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
            <p className="section-label">分析路径</p>
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
            <p className="section-label">报告依据</p>
            <h2>先展示证据，再给结论</h2>
            <p>
              报告中的回答和评分来自实际分析任务。你可以核对提问、模型回答原文、
              品牌提及与模型返回的来源，并看到样本和结果限制。
            </p>
            <dl>
              <div>
                <dt>问题</dt>
                <dd>对应的分析范围</dd>
              </div>
              <div>
                <dt>回答</dt>
                <dd>模型原文与提及</dd>
              </div>
              <div>
                <dt>结论</dt>
                <dd>样本、置信度与限制</dd>
              </div>
            </dl>
          </div>

          <div className="evidence-view">
            <div
              className="evidence-tabs"
              role="group"
              aria-label="查看报告内容"
            >
              {reportSections.map((section) => (
                <button
                  aria-pressed={activeSection.title === section.title}
                  className={
                    activeSection.title === section.title ? "is-active" : ""
                  }
                  key={section.title}
                  onClick={() => setActiveSection(section)}
                  type="button"
                >
                  {section.title}
                </button>
              ))}
            </div>
            <div className="question-block" id="report-section">
              <Quotes aria-hidden="true" />
              <div>
                <span>报告内容</span>
                <strong>{activeSection.title}</strong>
              </div>
            </div>
            <div className="answer-block">
              <span>可核对的信息</span>
              <p>{activeSection.description}</p>
            </div>
            <div className="source-list">
              <span>报告字段</span>
              <ol>
                {activeSection.fields.map((field, index) => (
                  <li key={field}>
                    <strong>0{index + 1}</strong>
                    {field}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <p className="section-label">开始使用</p>
          <div>
            <h2>从第一份报告开始，找到下一步</h2>
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
