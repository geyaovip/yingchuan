import type { CSSProperties } from "react";

import { capabilities, productUrl, workflow } from "./content";

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export function App() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>

      <header className="site-header">
        <a className="wordmark" href="/" aria-label="映川首页">
          <BrandMark />
          <span>映川</span>
        </a>
        <nav aria-label="主导航">
          <a href="#capabilities">产品能力</a>
          <a href="#workflow">工作方式</a>
          <a href="#value">核心价值</a>
        </nav>
        <a className="header-action" href={productUrl}>
          进入工作台
          <Arrow />
        </a>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span />
              AI 品牌可见度分析平台
            </p>
            <h1 id="hero-title">
              看见品牌，
              <br />
              如何被 AI 看见
            </h1>
            <p className="hero-intro">
              映川帮助品牌与本地商家持续检测主流大模型如何理解、提及和推荐自己，
              用清晰证据找到可见度差距，并把结论变成下一步行动。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href={productUrl}>
                开始品牌检测
                <Arrow />
              </a>
              <a className="button button-secondary" href="#workflow">
                了解工作方式
              </a>
            </div>
            <p className="hero-note">
              邮箱验证码登录 · 无需安装 · 桌面与移动端均可使用
            </p>
          </div>

          <div className="report-preview" aria-label="映川报告界面示意">
            <div className="preview-topbar">
              <span className="mini-wordmark">
                <BrandMark />
                映川报告
              </span>
              <span className="preview-pill">示例视图</span>
            </div>
            <div className="preview-heading">
              <div>
                <small>品牌可见度概览</small>
                <strong>让每个结论都有证据</strong>
              </div>
              <div className="score-orbit" aria-hidden="true">
                <span>AI</span>
              </div>
            </div>
            <div className="preview-grid">
              <article className="preview-card preview-card-wide">
                <span className="card-label">跨模型检测</span>
                <div className="model-lines" aria-hidden="true">
                  <i style={{ "--line": "84%" } as CSSProperties} />
                  <i style={{ "--line": "66%" } as CSSProperties} />
                  <i style={{ "--line": "76%" } as CSSProperties} />
                  <i style={{ "--line": "52%" } as CSSProperties} />
                </div>
                <div className="model-legend">
                  <span>品牌提及</span>
                  <span>推荐顺位</span>
                  <span>事实准确</span>
                </div>
              </article>
              <article className="preview-card">
                <span className="card-label">证据状态</span>
                <strong className="preview-metric">可追溯</strong>
                <small>回答、模型与时间完整记录</small>
              </article>
              <article className="preview-card">
                <span className="card-label">建议状态</span>
                <strong className="preview-metric">有优先级</strong>
                <small>从影响与投入两个维度排序</small>
              </article>
            </div>
          </div>
        </section>

        <section className="signal-bar" aria-label="产品特点">
          <span>多模型统一检测</span>
          <i />
          <span>证据与置信度优先</span>
          <i />
          <span>结果可复现</span>
          <i />
          <span>建议可执行</span>
        </section>

        <section className="section capabilities" id="capabilities">
          <div className="section-heading">
            <p className="section-kicker">从认知到行动</p>
            <h2>不只告诉你分数，更解释为什么</h2>
            <p>
              从品牌事实确认开始，到多模型检测、评分与优化建议，
              每一步都保留上下文和证据。
            </p>
          </div>
          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article key={capability.index} className="capability-card">
                <span className="capability-index">{capability.index}</span>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section workflow-section" id="workflow">
          <div className="workflow-copy">
            <p className="section-kicker">一条清晰的分析路径</p>
            <h2>从输入品牌，到获得第一份报告</h2>
            <p>
              映川把复杂的模型调用和解析过程收进一条可追踪流程，
              你只需要确认事实、问题与范围。
            </p>
            <a className="text-link" href={productUrl}>
              现在进入工作台
              <Arrow />
            </a>
          </div>
          <ol className="workflow-list">
            {workflow.map(([title, description], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="section value-section" id="value">
          <div className="value-panel">
            <div className="value-statement">
              <p className="section-kicker">为真实决策设计</p>
              <h2>先展示证据，再给结论</h2>
            </div>
            <div className="value-points">
              <p>
                <strong>看清样本</strong>
                知道这次结论来自哪些问题、哪些模型和哪些回答。
              </p>
              <p>
                <strong>理解限制</strong>
                失败、跳过和低置信度结果不会被藏在一个漂亮分数里。
              </p>
              <p>
                <strong>持续改进</strong>
                把可见度问题转换为可复测的优化方向，而不是一次性报告。
              </p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="section-kicker">开始第一轮检测</p>
            <h2>知道 AI 正在怎样介绍你的品牌</h2>
          </div>
          <a className="button button-light" href={productUrl}>
            进入映川
            <Arrow />
          </a>
        </section>
      </main>

      <footer>
        <a className="wordmark footer-wordmark" href="/" aria-label="映川首页">
          <BrandMark />
          <span>映川</span>
        </a>
        <p>AI 品牌可见度分析与持续运营管理平台</p>
        <a href={productUrl}>用户工作台</a>
        <span>© {new Date().getFullYear()} 映川</span>
      </footer>
    </div>
  );
}
