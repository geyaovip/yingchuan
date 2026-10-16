# 可观测性与运行手册

## 1. 可观测性标准

HTTP、队列、外部模型、Agent、报告和通知共享 `traceId`；用户可见错误带 `requestId`。结构化日志字段包括 service、environment、version、workspaceId（允许时）、actorId、jobId/runId、provider/model、duration、result 和稳定错误码。

首期由 OpenTelemetry 统一采集。映川与其他项目共用云服务器：如宿主已有 Prometheus/Loki/Grafana，通过独立 service/environment label、日志目录和访问控制复用；否则放入映川可选 `observability` Compose profile。所有组件设置资源限制，业务数据库不得作为日志后端，不得为了监控影响同机其他项目。

禁止记录：Authorization/Cookie、完整 Token/API Key、支付详情、完整用户隐私、未经处理的超长模型请求/响应。

## 2. 核心指标

| 范围            | 指标                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| API             | request count、error rate、P50/P95/P99 latency、active requests              |
| Queue           | waiting/active/delayed/failed、oldest age、throughput、worker heartbeat      |
| Model           | success/rejection/429/5xx、latency、token、cost、retry、unknown outcome      |
| Analysis        | Job completion/partial/failure、duration、runs per job、cancel rate          |
| Parsing/Scoring | parse failure、low confidence、score duration、version distribution          |
| Report          | success、generation duration、file/storage errors                            |
| Agent           | runs、skill calls、approval、failure、token/cost、loop limit                 |
| Notification    | delivery success、retry、latency、channel health                             |
| Business        | activation funnel、first analysis、report view、retest、P0-A/P0-B activation |

高基数字段（原始 Prompt、URL、用户 email）不得作为 metric label。

## 3. Dashboard

- 系统健康：API/DB/Redis/Worker、部署版本、错误与延迟。
- 分析流水线：各阶段吞吐、积压、失败与端到端耗时。
- 模型供应商：按 Provider/Model 的健康、成本和限流。
- 报告与通知：生成/投递成功率和延迟。
- Agent：运行、Skill、审批、成本和失败。
- 业务与质量：激活、首次分析、报告查看、复测、识别确认率、解析准确率；P0 不展示付费转化。

## 4. 初始 SLO

- API 月可用性：99.9%，以非计划 5xx/不可达请求衡量；
- 普通列表 P95 < 800ms，关键详情 P95 < 1.5s；
- PostgreSQL 在本机使用每日全量备份和 WAL 归档；未配置异地副本前，只承诺本机可用时的逻辑恢复，不承诺整机损坏 RPO/RTO；
- AnalysisJob、报告成功率和通知时效在 staging 收集两周基线后补充数值目标；
- P0/P1 告警上线前必须指定管理员责任人和升级路径。

单次健康检查不能代替可用性。每月回顾错误预算，若持续消耗则优先稳定性工作。

## 5. 常见事件手册

### API 错误率升高

1. 确认影响路由、版本、工作区范围和开始时间。
2. 对照最近部署、数据库/Redis、下游 Provider。
3. 若为新版本回归，按发布策略回滚或关闭功能开关。
4. 验证错误率和延迟恢复，记录事件时间线。

### 队列积压

1. 查看 oldest age、失败类型、Worker heartbeat 和 Provider 限流。
2. 区分生产过快、消费变慢、毒消息和依赖故障。
3. 在并发/成本限制内扩容或暂停生产；不要无界批量重试。
4. 对 reconciliation 和业务计数确认无重复调用/扣费。

### 模型失败率或成本异常

1. 按 Provider/Model/错误类别/版本分解。
2. 检查价格配置、Token 变化、429、超时与请求尺寸。
3. 区分单 Model ID 异常与火山方舟账户/区域级异常。P0 只允许人工按权限处理，不自动切换到其他原厂 API。需要联网但具体方舟 Model ID/API 模式无内置能力属于配置不支持，不用外部搜索降级。
4. 供应商结果未知时先通过 request ID 核验，防止重复计费。

### 报告超时

1. 分解数据查询、渲染、文件上传各阶段。
2. 检查异常大项目、私有文件卷、磁盘空间和 Worker 内存。
3. 可安全重放时只重放报告阶段，不重复模型调用和评分。

### Telegram 失败

1. 由平台管理员在管理端查看脱敏错误类别：认证、Chat ID、限流、网络。
2. 依照 1/5/15 分钟策略重试；连续失败标记渠道 unhealthy。
3. 确认主分析未受影响；P0 告警写入站内最高级事件。
4. Token 无效时要求管理员覆盖更新，系统不得回显旧值。

### 疑似跨租户访问

1. 视为安全事件，保全审计、访问日志和 trace。
2. 限制相关身份/会话，评估对象和时间范围。
3. 不在普通告警或聊天中传播敏感详情。
4. 按安全响应流程通知责任人并修复；发布前补回归测试。

## 6. 备份与恢复

- PostgreSQL：每日全量备份并持续归档 WAL 到服务器独立备份目录，备份文件加密、校验并按周期执行恢复测试。
- 私有文件：数据目录与临时目录分离，生命周期与数据库引用一致；删除采用可审计流程。
- 灾难恢复限制：备份与生产位于同一台服务器时，无法防护整机或磁盘彻底损坏。接入异机/异地存储后再定义并承诺完整 RPO/RTO。
- Redis：不作为唯一事实源；恢复后由 Outbox/Reconciliation 补齐。
- 定期演练恢复到隔离环境，并验证项目、账本、Job、报告引用和审计一致性。

## 7. 事件复盘

P0/P1 事件记录影响、检测方式、时间线、缓解、根因、数据/费用影响、恢复验证和行动项。复盘关注系统改进，不以 Agent 的推测代替日志和指标证据。

## 8. 共享 APaaS 网关路由

`api.chatway.chat` 同时承载三个 APaaS 应用的 API。Caddy 必须先用 `handle_path` 去除应用前缀，再转发到专属容器；其余请求才进入映川 `api:3000`。

| 路径前缀            | 上游                             |
| ------------------- | -------------------------------- |
| `/apaas-sales360/*` | `apaas-sales360-crm-api:4301`    |
| `/apaas-mes/*`      | `apaas-mes-api:4401`             |
| `/apaas-erp/*`      | `apaas-electronics-erp-api:4501` |

若应用容器 healthy、公网却返回 `Cannot GET /apaas-.../api/v1/health`，先检查发布是否覆盖了这三条路由。配置以 `deploy/caddy/Caddyfile.example` 为源；禁止只在运行容器里临时补路由。变更前备份当前配置、执行 `caddy validate`，再热重载；文件绑定挂载时应保留被挂载文件的 inode。

`deploy/scripts/check-runtime.sh` 的 `all` 模式会同时检查映川就绪接口和这三条公网网关健康路由，任一路由失败均阻断发布成功状态。热修复后还需复测三个 Cloudflare Worker 的 `/api/v1/health`、未登录鉴权以及相邻服务健康。
