# 决策记录

状态：`proposed | accepted | superseded | rejected`。这里只记录已被 PRD 明确或开发前基线可直接确认的决定；供应商和商业规则不擅自补全。

| ID    | 状态       | 日期       | 决策                                                                        | 理由/后果                                                                                                                                                   |
| ----- | ---------- | ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | accepted   | 2026-07-22 | 使用统一 BrandEntity，不让用户选择品牌/单店/连锁类型                        | 项目能力由已识别的来源和门店动态组成                                                                                                                        |
| D-002 | accepted   | 2026-07-22 | P0 使用模块化单体 API + 独立 Worker，不拆微服务                             | 保留领域边界，降低首期部署和一致性成本                                                                                                                      |
| D-003 | superseded | 2026-07-22 | 技术基线为 Next.js、TypeScript、NestJS、Prisma、PostgreSQL、Redis/BullMQ    | 前端 Next.js 部分由 D-036 取代；后端和数据基线保持                                                                                                          |
| D-004 | accepted   | 2026-07-22 | 模型供应商通过 Model Gateway 接入                                           | 业务逻辑不依赖供应商协议，统一成本、错误、限流与观测                                                                                                        |
| D-005 | accepted   | 2026-07-22 | 长流程全部异步，所有任务带幂等键                                            | 支持重试、部分成功、恢复和成本控制                                                                                                                          |
| D-006 | accepted   | 2026-07-22 | 评分算法独立、版本化，历史报告不可被覆盖                                    | 保持趋势和证据可解释性                                                                                                                                      |
| D-007 | accepted   | 2026-07-22 | Agent 只通过 Skill Registry 调用应用服务                                    | 不直连生产数据库，不读取密钥，不绕过权限                                                                                                                    |
| D-008 | accepted   | 2026-07-22 | 异常由确定性规则触发，Agent 仅补充解释与建议                                | Agent 失败或幻觉不能阻止/伪造告警                                                                                                                           |
| D-009 | accepted   | 2026-07-22 | 所有时间 UTC 存储，按 IANA 项目/用户时区展示                                | 默认 Asia/Shanghai，支持项目覆盖                                                                                                                            |
| D-010 | accepted   | 2026-07-22 | 金额使用最小货币单位或 Decimal，禁止浮点                                    | 保障成本与账本一致性                                                                                                                                        |
| D-011 | accepted   | 2026-07-22 | 工作区是授权与数据隔离边界                                                  | 所有项目归属于工作区，Agent 权限不高于触发者                                                                                                                |
| D-012 | accepted   | 2026-07-22 | Telegram 只由平台管理员在管理端配置                                         | 不做用户端/工作区 Telegram 配置；P0 配置与测试，P1 管理告警与日报推送                                                                                       |
| D-013 | accepted   | 2026-07-22 | 使用 Transactional Outbox + reconciliation 保证数据库/队列一致性            | Epic 0 Spike 已验证：事务写业务与事件、事件 UUID 作为 BullMQ jobId、短租约认领、3 次重试/死信、Serializable InboxReceipt 消费幂等、无收据发布事件对账重投   |
| D-014 | accepted   | 2026-07-22 | Prompt 内容与版本拆表，ModelRun 引用不可变版本                              | 避免运行时编辑破坏历史证据；数据库设计评审确认字段与索引                                                                                                    |
| D-015 | accepted   | 2026-07-22 | Project 不使用 `analyzing` 状态                                             | 分析进度由 AnalysisJob 表达；首次可用报告完成后 Project 进入 `active`                                                                                       |
| D-016 | accepted   | 2026-07-22 | P0 使用邮箱验证码登录，邮件由 Resend 发送                                   | 不做密码、手机号、微信和企业 SSO；验证码服务端哈希保存、短期有效、限频限次                                                                                  |
| D-017 | accepted   | 2026-07-22 | 首批检测豆包、Kimi、GLM、DeepSeek                                           | Provider/Model 数据驱动；具体模型 ID 可升级，但每次运行冻结版本和能力快照                                                                                   |
| D-018 | accepted   | 2026-07-22 | 联网搜索按 Prompt/任务需要显式启用                                          | 不把联网与非联网结果混为同一条件；需要地域但缺少内容时要求用户填写，不自动猜测                                                                              |
| D-019 | superseded | 2026-07-22 | P0 品牌识别使用用户输入、公开搜索和允许访问的公开网页                       | 联网搜索来源由 D-038 收紧为模型官方原生能力                                                                                                                 |
| D-020 | accepted   | 2026-07-22 | `score-v1` 使用 PRD 八个基础维度与建议权重                                  | 上线前用固定 golden dataset 校准；门店动态维度进入新的 scoreVersion                                                                                         |
| D-021 | accepted   | 2026-07-22 | P0 不接真实支付                                                             | 仅实现额度限制、追加式用量账本和模型成本记录；支付与商业套餐后置                                                                                            |
| D-022 | accepted   | 2026-07-22 | P0 报告只保证登录态在线查看                                                 | PDF、公开分享链接和访问密码后置                                                                                                                             |
| D-023 | accepted   | 2026-07-22 | 初始数据保留按分类执行                                                      | 模型响应/网页快照/Agent 对话 180 天，导入原文件 30 天，审计至少 2 年，已发布报告随项目保留                                                                  |
| D-024 | superseded | 2026-07-22 | 使用 GitHub + Cloudflare + 现有云服务器的混合部署                           | 原方案包含 Workers/R2，最终由 D-036 的 Vite SPA + 纯静态 Pages 方案取代                                                                                     |
| D-025 | accepted   | 2026-07-22 | OpenClaw 首次锁定 `v2026.7.1` 官方容器                                      | 仅内网接入 Agent Gateway，固定镜像版本和摘要；升级经 staging 验证，不使用浮动 `latest`                                                                      |
| D-026 | accepted   | 2026-07-22 | 首期不启用“高价值用户连续失败”告警                                          | 保留规则扩展位，不创建无业务定义的默认规则                                                                                                                  |
| D-027 | accepted   | 2026-07-22 | 首期不做门店 CSV 导入                                                       | 门店能力不作为 P1 承诺；后续重新评审自动识别、手工维护和批量导入范围                                                                                        |
| D-028 | accepted   | 2026-07-22 | 核心实体 ID 使用 UUIDv7                                                     | 保持时间有序且不可枚举业务序号                                                                                                                              |
| D-029 | accepted   | 2026-07-22 | 用户端必须自适应，视觉参考 Perplexity 的克制信息层级                        | 使用映川自身品牌 token，不复制其商标、文案或独特界面资产；目标 WCAG 2.1 AA                                                                                  |
| D-030 | superseded | 2026-07-22 | 初始运行目标为 API 99.9%、RPO 15 分钟、RTO 2 小时                           | RPO/RTO 依赖异地备份，当前低成本单服务器方案改由 D-035 管理风险                                                                                             |
| D-031 | accepted   | 2026-07-22 | P0 产品 UI 和报告使用简体中文                                               | Prompt 与模型分析语言跟随项目配置；完整英文 UI/多语言报告后置                                                                                               |
| D-032 | accepted   | 2026-07-22 | 取消后已有成功结果的 Job 终态为 `partially_completed`                       | 另存 `cancelledByUser`、取消人、原因和时间；无成功结果才为 `cancelled`                                                                                      |
| D-033 | accepted   | 2026-07-22 | 首期可观测后端在云服务器自托管                                              | OpenTelemetry 采集，Prometheus 指标、Loki 日志、Grafana 展示；容量不足时再迁移托管服务                                                                      |
| D-034 | superseded | 2026-07-22 | Cloudflare 只部署 Web/Admin 静态页面                                        | “只部署静态前端”保持；Next.js static export 由 D-036 的 Vite SPA 取代                                                                                       |
| D-035 | accepted   | 2026-07-22 | P0 文件与备份只使用云服务器本地持久卷                                       | 数据库全量/WAL 和私有文件保存在独立目录/数据盘；未配置异机或异地副本前，不承诺整机损坏场景的 RPO/RTO                                                        |
| D-036 | accepted   | 2026-07-22 | Web/Admin 使用 Vite + React + TypeScript SPA，静态部署到 Cloudflare Pages   | 运行时项目/报告 ID 无法在 Next.js static export 构建时枚举；SPA 路由与纯静态 Pages 匹配，不使用 Cloudflare 服务端产品                                       |
| D-037 | accepted   | 2026-07-22 | 生产域名固定为 `app.chatway.chat`、`admin.chatway.chat`、`api.chatway.chat` | API 使用 host-only Secure HttpOnly SameSite=Lax Session Cookie、精确 CORS、credentialed fetch、Origin + Session 绑定 CSRF Token；Pages preview 不连生产 API |
| D-038 | accepted   | 2026-07-22 | 联网只使用目标大模型官方 API 自带能力                                       | 不使用外部搜索服务或其他模型代搜；无原生联网能力时跳过该联网组合，非联网任务仍可运行                                                                        |
| D-039 | accepted   | 2026-07-22 | P0 管理员二次验证复用 Resend 邮箱验证码                                     | 验证通过后敏感操作窗口 10 分钟，绑定用户、Session 和管理端 Origin                                                                                           |
| D-040 | accepted   | 2026-07-22 | owner/admin 可恢复已归档项目                                                | 恢复到归档前 `ready`/`active` 状态并审计；删除或法律保留流程不走普通恢复                                                                                    |
| D-041 | accepted   | 2026-07-22 | `score-v1` 消除覆盖度在分数/置信度的重复计算并收紧顺位、一致性和 N/A 规则   | 覆盖度保留为 PRD 评分维度，不再进入置信度；无顺位推荐记 50，全部不提及不因一致性获高分，上线前过 golden dataset 门槛                                        |
| D-042 | accepted   | 2026-07-22 | P0 按 P0-A 核心闭环和 P0-B 管理/Agent 两个可验收增量交付                    | 总范围不变，先降低四类模型分析报告主链路的集成风险                                                                                                          |
| D-043 | accepted   | 2026-07-22 | P0 密钥字段使用应用层 AEAD envelope encryption                              | 主密钥由云服务器 Secret/受限文件注入，不进数据库/镜像/GitHub；保留未来 KMS provider 接口                                                                    |
| D-044 | accepted   | 2026-07-22 | P0 四类模型统一通过火山方舟账户调用                                         | Provider 只有 `volcengine_ark`，豆包/Kimi/GLM/DeepSeek 是独立 ModelConfig；Model ID 与内置联网能力以账户当前可用列表和 staging 探测为准，不直连其他原厂 API |
| D-045 | accepted   | 2026-07-22 | 后端与其他项目共用现有云服务器                                              | 映川使用独立 Compose project、网络、容器、DB 账户/库、Redis 隔离和持久卷；可共用宿主 Caddy/可观测基础设施，但必须设资源上限                                 |
| D-046 | accepted   | 2026-07-22 | Resend 发件域名使用 `mail.chatway.chat`                                     | 在 Resend 后台创建并按实时提示向 Cloudflare DNS 添加验证记录；默认发件人为 `映川 <login@mail.chatway.chat>`                                                 |
| D-047 | accepted   | 2026-07-22 | P0 管理端只允许 `geyaovip@163.com` 登录                                     | 邮箱规范化后精确匹配 `ADMIN_ALLOWED_EMAILS`，初始化为 `super_admin`；其他邮箱不获得管理 Session/路由权限。该限制仅针对管理端，用户端邮箱验证码登录保持      |
| D-048 | accepted   | 2026-07-23 | 根域 `chatway.chat` 部署独立响应式产品官网                                  | 使用 Vite + React + TypeScript 静态站点和 Cloudflare Pages；官网只展示产品信息并跳转 `app.chatway.chat`，不调用生产 API、不建立认证 Session                 |
| D-049 | accepted   | 2026-07-23 | 用户端与管理端 Session 默认有效期为 365 天                                  | 提供接近长期登录的体验；保留主动退出、账号停用和服务端撤销能力，不创建无法撤销的永久 Session                                                                |

## 新增决策模板

```markdown
## D-XXX 标题

- 状态：proposed
- 日期：YYYY-MM-DD
- 决策人：
- 背景：
- 备选项：
- 决策：
- 后果：
- 影响文档/模块：
```
