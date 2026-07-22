# AGENTS.md

本文件适用于整个仓库，供 Codex、Cursor 和其他开发代理使用。

## 最小上下文规则

不要在每个任务开始时通读全部文档。默认只加载：

1. 本文件；
2. 当前任务在 `docs/delivery/mvp-backlog.md` 中的一个 Story 段落；
3. `docs/README.md` 路由表指定的一份主文档；
4. 当前 Story 明确引用的开放问题或补充文档片段。

先用 `rg -n "关键词|Story ID|OQ-XXX" docs` 定位，再读取命中段落附近内容。完整 PRD、完整 Backlog、全部开放问题和所有专题文档均不得默认整篇加载。

`docs/product/prd-v3.md` 是追溯用原始快照。只有当专题文档缺失、互相冲突或需要核对原始验收文字时，才检索并读取对应章节，不得无条件通读。

以 `docs/delivery/decision-log.md` 为已确认决策源。若当前任务命中“阻塞”开放问题，不得自行猜测后固化；超出 Story 范围时先更新设计和范围说明。

## 强制实现规则

- 首期使用模块化单体，不提前拆微服务。
- 核心实体使用明确类型和约束；`metadata` 只能承载非关键扩展信息。
- 所有写操作经应用服务执行；页面、Agent、Worker 不得直接改数据库。
- 所有异步任务必须有幂等键、重试上限、超时、死信处理和审计关联。
- 工作区隔离必须在服务端校验；不能只依赖前端隐藏。
- Agent 只调用 Skill Registry 中声明的 Skill，权限不得高于触发者。
- 中风险 Agent 动作必须审批；高风险动作不提供 Skill。
- 管理端写操作、审批、敏感配置变化都写审计日志。
- 模型调用记录供应商、模型、Token、成本、耗时、错误和重试次数。
- 外部网页与模型输出均视为不可信输入。
- 时间以 UTC 存储，按用户或项目时区展示；金额使用整数最小单位或 Decimal。
- 评分结果必须携带 `scoreVersion`；不同版本默认不直接连成趋势。
- 第三方模型只能通过 Model Gateway 接入。
- P0 Model Gateway 只实现火山方舟 Provider；豆包、Kimi、GLM、DeepSeek 是同一 Provider 下的独立 ModelConfig，不直连其他原厂 API。
- 联网只使用火山方舟对当前 Model ID/API 模式官方暴露的内置能力；不支持时跳过，不接外部搜索或其他模型代搜。
- P0 管理端只允许 `geyaovip@163.com`；白名单校验必须在服务端执行，不能只隐藏页面。
- Telegram Token 等密钥只存在于服务端密钥系统或加密字段中，永不回显。

生产服务器与其他项目共用。部署脚本必须显式使用 `COMPOSE_PROJECT_NAME=yingchuan` 和映川专用容器/卷/网络/数据目录；禁止 `docker system prune`、全局 Compose down、通配端口杀进程或操作其他项目资源。

## 代码边界

建议依赖方向：

```text
apps -> application modules -> domain -> shared primitives
workers -> application modules
agents -> skill contracts -> application modules
infrastructure adapters -> provider SDKs / database / queue
```

禁止领域模块直接引用供应商 SDK。跨模块写入通过公开应用服务或领域事件完成，禁止跨模块直接修改表。

## 每个变更的最低交付

- 实现及数据库迁移（如需要）；
- 单元测试；核心流程的集成测试；
- 权限、租户隔离和失败路径测试；
- API/事件/状态机文档同步；
- 新环境变量加入 `.env.example`，不得提交真实密钥；
- 通过 lint、typecheck、test、build 和文档链接/表格结构检查。

## 完成定义

只有当 Story 的验收条件可重复验证、错误与日志可定位、文档已同步且没有新增未登记决策时，任务才算完成。不得用静态假数据冒充已完成的业务链路。
