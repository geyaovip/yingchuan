# 安全与权限设计

## 1. 安全目标

保护工作区隔离、外部密钥、模型与抓取数据、管理能力、Agent 工具调用和计费账本。所有外部内容（网页、上传文件、模型输出、Agent 参数）均视为不可信。

## 2. 权限模型

权限由“身份 + 工作区成员角色 + 对象归属 + 具体动作”共同决定。角色只映射权限集合，业务服务仍检查对象状态和影响范围。

### 用户端权限摘要

| 能力            | owner | admin | analyst | operator | viewer |
| --------------- | :---: | :---: | :-----: | :------: | :----: |
| 工作区设置/删除 |   ✓   |       |         |          |        |
| 成员与角色      |   ✓   |  ✓*   |         |          |        |
| 创建/编辑项目   |   ✓   |   ✓   |    ✓    |          |        |
| 发起分析        |   ✓   |   ✓   |    ✓    |          |        |
| 维护来源/门店   |   ✓   |   ✓   |    ✓    |    ✓     |        |
| 查看报告        |   ✓   |   ✓   |    ✓    |    ✓     |   ✓    |
| 管理优化任务    |   ✓   |   ✓   |    ✓    |    ✓     |        |
| 查看用量        |   ✓   |   ✓   |    ✓    |          |        |

`*` admin 不得移除/降级最后一个 owner，也不能赋予高于自身的权限。

### 管理端职责约束

- P0 管理端登录白名单只有规范化邮箱 `geyaovip@163.com`，通过环境变量 `ADMIN_ALLOWED_EMAILS` 注入并在启动时校验。其他邮箱不发送管理登录验证码，不能创建管理 Session；响应不泄露白名单。
- `super_admin` 不是免审计账户；高敏能力需使用 Resend 邮箱验证码二次验证，验证窗口为 10 分钟。
- `support` 默认看脱敏用户上下文，无模型密钥、完整支付信息和跨用户导出。
- `finance_viewer` P0 只读额度账本、模型用量和汇总成本；不存在真实支付订单。
- `data_reviewer` 只能处理质量对象，不调整额度或模型。
- `ops_engineer` 可处理任务与健康状态；批量/模型开关在审批上线后按中风险流程。

详细 action code 在实现时以 `resource.action` 命名并写入种子数据，API 测试以权限码而不是角色名断言。

首批工作区权限码为：`workspace.settings.manage`、`workspace.delete`、`member.manage`、`project.manage`、`analysis.run`、`source.manage`、`store.manage`、`report.view`、`optimization.manage`、`usage.view`。新增或拆分权限码时必须同步角色 fixture 和权限测试。

## 3. 租户隔离

- 请求进入时解析 `workspaceId`，在服务端查询成员身份。
- Repository 查询必须显式带租户条件；建议封装 tenant-aware repository，禁止通用 `findById` 用于租户实体。
- 子资源权限从父对象归属推导，不能信任请求体中的 `workspaceId`。
- 缓存键包含 workspace；切换工作区清理前端 query cache。
- 对不存在和跨租户对象统一返回 404。
- 集成测试覆盖横向越权：项目、报告、Run、来源、文件、Agent 会话与通知。

## 4. 密钥与敏感数据

- 火山方舟 API Key、Telegram Token 使用应用层 AEAD envelope encryption；数据库仅存密文、key version 和掩码元数据。P0 主密钥由服务器 Secret/受限权限文件注入，不存数据库、镜像或 GitHub；为未来 KMS 保留 key provider 接口。
- 写入后不提供明文读取接口；验证通过测试调用完成。
- 日志过滤 Authorization、Cookie、Token、API Key、支付和个人字段。
- 私有文件保存在云服务器数据目录，只能经 File Service 鉴权读取；反向代理不得直接映射整个数据目录。
- 本地 `.env` 不提交；CI 使用 secret store；密钥轮换产生审计。

### 邮箱验证码与 Resend

- Resend API Key 仅由 Auth/Notification 服务读取；发件域名 `mail.chatway.chat` 必须在 Resend 完成验证，发件人固定为 `映川 <login@mail.chatway.chat>`。
- 验证码使用密码学安全随机数生成，只在数据库保存带服务端 pepper 的哈希；10 分钟后失效，成功验证后立即作废。
- 同一验证码最多尝试 5 次；按邮箱、IP、设备和时间窗限流，异常请求产生安全指标但不泄露账号是否存在。
- 发送请求使用幂等键，模板不得包含敏感业务数据；日志只记录 Resend message ID、结果和脱敏收件地址。
- Session 由 `api.chatway.chat` 使用 host-only、HttpOnly、Secure、SameSite=Lax Cookie，默认有效期 365 天；用户主动退出、账号停用或服务端撤销后立即失效。登录、退出、换绑邮箱和管理员敏感操作写入安全审计。
- 生产 Web/Admin/API 固定为 `app.chatway.chat`、`admin.chatway.chat`、`api.chatway.chat`。`*.pages.dev` preview 不允许连接生产 API。

## 5. 外部抓取与 SSRF

- URL 只允许 `http/https`；解析并阻止 loopback、link-local、私网、云元数据地址和 DNS rebinding。
- 限制重定向次数、响应大小、MIME、超时和解压比；不执行脚本。
- 抓取 Worker 使用独立 Docker network 和受限出站规则，只能通过应用服务取得任务/写回结果，不能访问 PostgreSQL/Redis 管理面、OpenClaw 控制面和云元数据地址。
- P0 抓取 allowlist 只包含用户输入并确认的官网/公开 URL，以及用户确认后的模型原生联网引用。模型候选引用在确认前只展示，不自动深度抓取。
- 尊重法律、平台条款、robots 与授权策略；不抓登录后、验证码后或平台明确禁止自动访问的内容。
- 抽取内容存为数据，不拼入系统指令；向模型传递时明确其不可信边界。

## 6. Agent 与提示词注入

- System policy、Skill schema 与外部内容分离；网页/模型文本不能新增工具或改变权限。
- Skill 参数使用结构化 schema 严格校验，忽略文本中伪造的“管理员指令”。
- 每次调用重新校验触发者权限、租户、风险和范围。
- Agent 只收到完成任务所需的最小字段；敏感值使用不可逆掩码。
- 设置 Token、次数、时间和成本预算，检测重复工具循环。
- 中风险 Action 展示规范化参数和影响范围，批准后参数不可变。

## 7. Web 与 API 防护

- Session Cookie 使用 HttpOnly、Secure、SameSite=Lax；所有状态修改必须校验精确 Origin 和由 `/auth/session` 返回、与 Session 绑定的 `X-CSRF-Token`。Web/Admin 使用 `credentials: 'include'`，API 不允许通配 CORS Origin，也不为共享 CSRF 值而扩大 Session Cookie Domain。
- 登录、邀请、密钥验证、Agent 和导出接口单独限流。
- 输入做长度、枚举、格式和业务校验；输出按上下文编码。
- 文件上传校验扩展名、MIME、大小和病毒风险；异步解析。首期不提供门店 CSV 导入。
- 安全响应头、严格 CORS、管理端禁止被 iframe 嵌入。
- 依赖锁文件、自动漏洞扫描、最小权限容器和非 root 运行。

## 8. 审计

必须审计：管理端所有写操作、成员/角色变化、密钥配置与测试、模型价格/并发/状态、额度变化、任务重试/取消、Agent Skill/Action/审批、实体合并和报告发布。

审计记录包含谁、何时、通过何身份、做了什么、对象、结果、风险、审批、request/trace ID 和必要的前后摘要；不得记录密钥、完整 Prompt 私密内容或完整支付数据。审计存储只追加并限制访问。

## 9. 上线安全门槛

- 完成跨租户自动化测试和管理权限矩阵测试。
- 生产密钥不在仓库、构建产物、客户端 Bundle 或普通日志。
- SSRF、文件上传、提示词注入和越权进行专项测试。
- 按 D-023 验证生命周期删除、用户删除/导出和法律保留；明确安全事件响应责任人。
- 备份恢复演练有证据，审计与告警可查询。
