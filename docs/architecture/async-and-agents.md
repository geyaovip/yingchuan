# 异步任务、Agent 与告警设计

## 1. 队列目录

| 队列                   | 阶段          | 生产者               | 消费者                | 幂等键示例                            |
| ---------------------- | ------------- | -------------------- | --------------------- | ------------------------------------- |
| `brand-identification` | P0-A          | Project API          | identification worker | `project:{id}:identify:{version}`     |
| `source-discovery`     | P0-A          | identification       | discovery worker      | `project:{id}:discover:{version}`     |
| `source-fetch`         | P0-A          | API                  | fetch worker          | `source:{id}:fetch:{contentVersion}`  |
| `prompt-generation`    | P0-A          | API/identification   | prompt worker         | `project:{id}:prompt-gen:{inputHash}` |
| `model-run`            | P0-A          | analysis dispatcher  | model worker          | `run:{modelRunId}:invoke`             |
| `response-parse`       | P0-A          | model worker         | parser                | `run:{id}:parse:{parserVersion}`      |
| `score-calculate`      | P0-A          | analysis coordinator | scorer                | `job:{id}:score:{scoreVersion}`       |
| `report-generate`      | P0-A          | scorer/API           | report worker         | `report:{id}:version:{n}`             |
| `notification-send`    | P0-B 最小能力 | domain events        | notification worker   | `delivery:{id}:attempt:{n}`           |
| `agent-run`            | P0-B          | API                  | agent worker          | `agent-run:{id}`                      |
| `scheduled-task`       | P1            | scheduler            | task-specific worker  | `schedule:{id}:window:{UTC bucket}`   |
| `data-quality-check`   | P2            | events/scheduler     | quality worker        | `check:{type}:{scope}:{version}`      |

## 2. 任务通用契约

每个消息 envelope 包含：

```json
{
  "messageId": "msg_...",
  "type": "analysis.model-run.requested.v1",
  "occurredAt": "2026-07-22T08:00:00Z",
  "traceId": "...",
  "actor": { "type": "user", "id": "..." },
  "workspaceId": "...",
  "aggregate": { "type": "ModelRun", "id": "...", "version": 1 },
  "idempotencyKey": "...",
  "payload": {}
}
```

消息只放 ID 和必要快照，不放密钥或大段原始模型响应。消费者先声明处理记录，再执行业务；重复消息返回已完成结果。ModelRun 的业务幂等键在所有尝试中不变，`attemptNumber` 只属于 RunAttempt 记录，不能用来绕过供应商重复调用防护。

## 3. 分析编排

1. 创建 AnalysisJob 时冻结输入并计算 `totalRuns` 和估算成本。
2. 校验额度，事务内预留额度/写 Job/写 Outbox。
3. dispatcher 分批创建 ModelRun，受工作区额度、Provider 并发和批量上限控制。需要联网但模型无原生联网能力的组合已在估算阶段排除，不进队。
4. 每个 ModelRun 调用后记录供应商是否实际计费，再触发解析。
5. coordinator 根据数据库计数推进 Job，不能依赖某条队列消息恰好到达。
6. 所有 Run 终止后计算分数；部分成功仍可生成带限制说明的报告。
7. 取消只阻止未派发/可取消的工作；已发出调用和成本保留。

默认重试 3 次，指数退避并加 jitter。429、5xx、网络超时和临时解析失败可重试；认证、余额、参数、模型不存在和策略拒绝进入永久失败。具体 Provider 错误由 Model Gateway 映射为统一错误类别。

## 4. 失败与恢复

- 每个队列配置超时、attempt 上限和 dead-letter 处理视图。
- stuck job 由 reconciliation 定时任务对照数据库状态恢复，不盲目重跑供应商调用。
- 供应商响应未知时标记 `outcome_unknown`，优先查询供应商 request ID；不能直接重复扣费。
- 重放必须选择明确阶段和最大范围，并产生新的审计事件。
- Redis 故障恢复后由 Outbox dispatcher 补投未发布事件。

### Transactional Outbox 实现基线

- 应用服务在同一 PostgreSQL 事务中写业务聚合与 `OutboxEvent`，事件幂等键唯一；事务失败时二者一起回滚。
- dispatcher 以短租约认领 `pending` 事件，BullMQ `jobId` 固定使用事件 UUID；“入队成功、标记发布失败”后的再次投递由 BullMQ 去重。
- 发布失败最多尝试 3 次，指数退避；达到上限进入 `dead_letter` 并保留稳定错误码，不无限重试。
- 消费者在 Serializable 事务中执行业务效果并写 `(consumer, eventId)` 唯一 `InboxReceipt`；重复消息返回已完成，不重复业务效果。
- reconciliation 查找超过窗口仍无消费收据的已发布事件，将其恢复为待投递；重投仍使用同一事件 ID。不得因为 Redis 丢失而伪造新业务事件。
- E3 当前共用 `domain-events` 物理队列，按 `project.identification.requested` 和 `source.fetch.requested` 事件类型路由到应用服务；BullMQ 最多 3 次指数退避，耗尽后分别回收为项目草稿或不可用认知源，不删除输入与任务事实。
- E6 的 `analysis.model-run.requested` 同样使用 `domain-events`；Worker 只能将 `queued` Run 原子认领为 `running`，最终写入 InboxReceipt。进程中断遗留的 `running` Run 由定时 reconciliation 标为 `outcome_unknown`，不盲目重发供应商调用。
- Job 提交在同一 Serializable 事务中写入额度预留、Job、唯一逻辑 Run 和 Outbox。终态时先追加释放预留，再按实际成功调用追加 debit/adjustment；重试后的差额使用新记录结算，不修改旧账。
- E7 在成功 ModelRun 后保存解析结果、实体/事实/竞品并生成 `score-v1`；E8 的 `report.generate` 生成不可变 ReportVersion，ready 后发布 `report.ready`；E11 消费同一事件幂等创建成员站内通知。每个阶段失败独立记录，不回滚上游事实。

## 5. Agent 架构

```text
用户/管理员/调度器
→ Agent Gateway（鉴权、租户、限流）
→ AgentRun（上下文与预算）
→ Skill Registry（schema、风险、权限、范围）
→ 应用服务 API
→ AgentAction / AuditLog
→ OpenClaw Runtime v2026.7.1（只接收已验证证据）
```

OpenClaw 使用官方 `v2026.7.1` 容器并固定镜像摘要，只通过内网与 Agent Gateway 通信。HTTP Chat Completions 默认关闭，部署配置显式开启后仍不映射宿主端口；Gateway Token 是完整 operator 密钥，只以 Compose secret 注入。OpenClaw 自身工具全部禁用，模型调用回到映川内部 OpenAI 兼容代理，再由 Model Gateway 选择已启用的火山方舟 ModelConfig，因此不会绕过统一调用日志与密钥管理。开发/测试无 OpenClaw 地址时使用确定性证据渲染器，不冒充生产联调。

当前 Skill Registry 注册 `dashboard.read`、`task.health.read`、`model.health.read`、`queue.health.read`、`project.report.read`、`retry_task`、`admin.todo.create`。前五项只读；后两项要求显式参数和幂等键。OpenClaw 只负责基于 Skill 证据组织回答，不能提出或执行产品 Action。涉及指标和项目结论时必须返回 Skill 引用；没有数据时明确回答无法确定。

## 6. Skill 定义模板

每个 Skill 必须包含：

```yaml
name: retry_task
version: 1
description: 重试一个允许重试的任务
inputSchema: RetryTaskInput
outputSchema: RetryTaskResult
requiredPermissions: [admin.analysis.retry]
risk: low
maxImpact: { jobs: 1 }
timeoutMs: 10000
idempotency: required
audit: full
```

还必须说明读/写、副作用、允许状态、错误码、数据新鲜度、敏感字段处理。Skill Registry 启动时拒绝缺字段或注册高风险 Skill。

## 7. 风险分级

- 低风险直接执行：查询、生成分析/草稿、创建待办/告警、单任务重试、已配置摘要发送。
- 中风险需审批：批量重试、暂停/切换模型、改并发、批量通知、增额度、改模板/门店、合并实体。
- 高风险不实现：删用户、改额度账本历史、输出密钥、直接 SQL、批量删项目、改管理员权限、关审计。P0 没有支付/退款 Skill。

中风险审批必须重新校验审批人的当前权限、Action 未过期、参数哈希未变化和目标仍处于允许状态。

## 8. 定时任务

- 所有 cron 按固定定义时区计算，但执行窗口转换为 UTC 并持久化。
- schedule window 是幂等键的一部分，避免重复日报和复测。
- 定时 Agent 使用专用服务账号、固定 Skill 白名单、预算和单次最大范围。
- 用户/项目时区覆盖只影响其业务计划，不修改全局服务器时区。
- P0 数据生命周期任务由 Worker 启动时及每 15 分钟检查一次；每个 UTC 小时窗口最多产生一个 `DataLifecycleRun`，失败优先重试，最多 3 次后进入 `dead_letter`。单次最多处理每类 1000 条且 5 分钟超时，法律保留记录在读取候选后再次参与逐条判断，结果和失败均写审计。

## 9. 告警和 Telegram

> 本节的告警规则、实时推送、去重和恢复属于 P1。P0 只实现管理员 Telegram 配置、测试消息与投递日志，不运行生产告警规则。

确定性指标规则创建 AlertEvent。Agent 可补充可能原因、影响和建议，但 Agent 失败不阻止基础告警。

默认阈值沿用 PRD：模型失败率 5 分钟 ≥10%、队列等待 10 分钟 ≥500、单小时模型成本比 7 天同期高 50%、报告平均耗时 15 分钟 ≥5 分钟均为 P1；当日新增比 7 日均值低 30% 为 P2。首期不启用“高价值用户连续失败”规则。

同一异常首次立即通知，30 分钟最多更新一次，相似事件按 fingerprint 合并；恢复后发送恢复通知。P1 Telegram 尝试按 1/5/15 分钟重试，最终失败标记渠道异常，同时保留站内事件。

Telegram 只由平台管理员在管理端配置，不提供用户端或工作区配置入口。Token 加密保存、仅可覆盖更新，API 只返回 `configured` 和尾部掩码；日志和消息禁止出现密钥、支付详情或用户隐私。Telegram 不可用不得影响主任务。
