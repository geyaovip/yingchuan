# 映川开发文档

## 文档权威顺序

发生冲突时按以下顺序处理：

1. 已签署的 ADR/决策记录；
2. [`product/prd-v3.md`](product/prd-v3.md) 的产品目标和验收要求；
3. 本目录中的专题设计；
4. Backlog 中的任务描述；
5. 代码注释和临时说明。

如果实现发现冲突，应先登记到开放问题或决策记录，不能悄悄选择一种解释。

## 按需加载规则

单次开发任务的目标上下文是：“当前 Story 片段 + 一份主文档”；确有跨领域依赖时再增加一份补充文档。不要把下表整列文档全部加载。

| 任务类型                                | 主文档                                                                                 | 仅在需要时补充                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 产品范围、术语                          | [`product/product-baseline.md`](product/product-baseline.md)                           | [`product/user-flows-and-pages.md`](product/user-flows-and-pages.md) |
| 页面、导航、交互                        | [`product/user-flows-and-pages.md`](product/user-flows-and-pages.md)                   | [`product/ui-design-system.md`](product/ui-design-system.md)         |
| 样式、组件、响应式                      | [`product/ui-design-system.md`](product/ui-design-system.md)                           | 页面清单对应章节                                                     |
| 工程初始化、部署                        | [`architecture/system-design.md`](architecture/system-design.md)                       | 运维文档                                                             |
| 数据库、实体、状态机                    | [`architecture/domain-model.md`](architecture/domain-model.md)                         | API 或异步文档对应章节                                               |
| 评分、置信度、趋势                      | [`architecture/scoring-v1.md`](architecture/scoring-v1.md)                             | 领域模型中的 VisibilityScore                                         |
| HTTP API、前后端联调                    | [`architecture/api-contract.md`](architecture/api-contract.md)                         | 领域模型对应实体                                                     |
| Resend、模型、OpenClaw、Cloudflare 接入 | [`architecture/integration-baseline.md`](architecture/integration-baseline.md)         | 系统设计对应章节                                                     |
| Worker、队列、任务                      | [`architecture/async-and-agents.md`](architecture/async-and-agents.md)                 | 领域模型中的任务状态                                                 |
| Agent、Skill、告警                      | [`architecture/async-and-agents.md`](architecture/async-and-agents.md)                 | 安全文档中的 Agent 小节                                              |
| 登录、权限、密钥、抓取                  | [`security/security-and-permissions.md`](security/security-and-permissions.md)         | 领域/API 对应章节                                                    |
| 测试、验收、发布检查                    | [`quality/test-strategy.md`](quality/test-strategy.md)                                 | 当前 Story 与相关设计                                                |
| 故障、指标、恢复                        | [`operations/observability-and-runbooks.md`](operations/observability-and-runbooks.md) | 异步或系统设计对应章节                                               |

### 特殊文档

- [`delivery/mvp-backlog.md`](delivery/mvp-backlog.md)：先用 Story ID 定位，只读当前 Story 所属 Epic。
- [`delivery/open-questions.md`](delivery/open-questions.md)：只读当前 Story 依赖的 OQ 编号；不要每次全读。
- [`delivery/decision-log.md`](delivery/decision-log.md)：只检索当前模块相关的 D 编号或关键词。
- [`product/prd-v3.md`](product/prd-v3.md)：完整原始快照，仅用于追溯冲突和原始验收文字，不是日常上下文。

### 推荐定位命令

```bash
rg -n '^### E6 |E6-S3|D-032' docs/delivery
rg -n 'AnalysisJob|partially_completed' docs/architecture
sed -n '起始行,结束行p' 目标文件
```

优先读取命中段落前后几十行；只有结构无法理解时才扩大范围。

## 文档维护规则

- 产品范围变化：同步产品基线、页面清单、Backlog 和验收矩阵。
- 实体或状态变化：同步领域模型、API、异步任务和测试策略。
- 新增外部服务：补充系统设计、安全威胁与运维指标。
- 新增 Agent Skill：记录输入输出、权限、风险、幂等、最大影响范围和审计字段。
- 任何不可逆决定：新增 ADR 或更新决策记录，不仅写在聊天或代码注释中。
- 不因方便而复制整段 PRD；专题文档应引用 PRD 章节或稳定术语，避免多份事实源。
