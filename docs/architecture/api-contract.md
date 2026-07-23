# API 契约

## 1. 基线约定

- 前缀：`/api/v1`；管理端使用 `/api/v1/admin`，不单独暴露未经鉴权的管理服务。
- 协议：HTTPS + JSON UTF-8；P0 文件上传使用 multipart，由 File Service 写入云服务器私有目录，不使用对象存储预签名 URL。
- ID：服务端统一生成不可枚举 UUIDv7。
- 时间：ISO 8601 UTC，例如 `2026-07-22T08:00:00Z`。
- 金额：`amountMinor` 整数 + `currency`，或 Decimal 字符串；响应不得返回二进制浮点金额。
- 版本并发：更新支持 `version`/`If-Match`，冲突返回 `409 CONCURRENT_MODIFICATION`。
- 每个响应返回或响应头包含 `requestId`。

平台探针：

```text
GET /api/v1/health   # 进程存活，不探测外部依赖
GET /api/v1/ready    # PostgreSQL、Redis、私有文件目录；失败返回 503
GET /api/v1/metrics  # Prometheus 文本格式，仅允许监控网络访问
```

所有 HTTP 响应返回 `X-Request-Id` 和 `X-Trace-Id`。有效的 `X-Request-Id` 与 W3C `traceparent` 可以继续传播；非法或超长值由服务端替换。指标不得使用邮箱、原始 URL、Prompt、workspaceId 等高基数字段作为 label，生产反向代理不得公开暴露 `/metrics`。

## 2. 鉴权与租户上下文

- 用户输入邮箱和一次性验证码登录；验证成功后由 `api.chatway.chat` 设置 host-only、HttpOnly、Secure、SameSite=Lax Session Cookie。Resend 仅负责发送邮件，不决定身份和 Session。
- Web/Admin 的 API 客户端必须使用 `credentials: 'include'`；API CORS 只允许 `https://app.chatway.chat` 和 `https://admin.chatway.chat`，不使用 `*`。
- 所有改变状态的请求除 SameSite 校验外，还要求 Session 绑定 CSRF Token：`GET /auth/session` 在认证后返回随机 `csrfToken`，客户端通过 `X-CSRF-Token` 回传，服务端同时校验精确 Origin。Token 在登录、会话轮换和退出时轮换/作废，不扩大 Session Cookie Domain。
- 工作区从路径或明确的 `X-Workspace-Id` 获取，服务端验证成员关系；不得信任客户端角色声明。
- 管理端同时校验平台角色和操作权限。高敏操作复用 Resend 邮箱验证码二次验证，通过后获得 10 分钟的敏感操作窗口，绑定当前用户、Session 和管理端 Origin。
- P0 管理登录请求带 `audience=admin`，服务端对规范化邮箱精确校验 `ADMIN_ALLOWED_EMAILS=geyaovip@163.com`。只有该邮箱能完成管理会话并获得初始 `super_admin`；其他邮箱统一返回不泄露白名单的文案，不发送管理验证码。用户端 `audience=user` 不受此白名单限制。
- 内部 Worker/Skill 使用短期服务凭证和明确 audience，不复用管理员长期 Token。

认证接口：

```text
POST   /api/v1/auth/email-code-requests
POST   /api/v1/auth/email-code-verifications
POST   /api/v1/auth/step-up-code-requests
POST   /api/v1/auth/step-up-code-verifications
POST   /api/v1/auth/logout
GET    /api/v1/auth/session
```

请求验证码无论邮箱是否已存在都返回一致文案。验证码 10 分钟有效、最多验证 5 次、只保存哈希；同邮箱 60 秒内不可重复发送，并按邮箱、IP 和设备设置小时/日限额。Resend 请求带幂等键，邮件发送失败不创建可用验证码会话。

## 3. 响应格式

成功：

```json
{
  "data": {},
  "meta": { "requestId": "req_..." }
}
```

列表：

```json
{
  "data": [],
  "meta": {
    "requestId": "req_...",
    "page": { "nextCursor": "opaque-or-null", "hasMore": false }
  }
}
```

错误：

```json
{
  "error": {
    "code": "ANALYSIS_QUOTA_INSUFFICIENT",
    "message": "当前额度不足以运行本次分析",
    "details": { "required": 120, "available": 80 },
    "requestId": "req_..."
  }
}
```

`message` 可本地化，客户端逻辑只能依赖稳定 `code`。校验错误 `details.fields` 可列字段，但不得返回堆栈、SQL 或供应商密钥。

## 4. 通用 HTTP 语义

|      状态 | 用途                                      |
| --------: | ----------------------------------------- |
|       200 | 同步读取/更新成功                         |
|       201 | 资源创建成功                              |
|       202 | 异步任务已接收                            |
|       204 | 无响应体的成功操作                        |
|       400 | 格式或业务前置条件错误                    |
| 401 / 403 | 未认证 / 无权限                           |
|       404 | 不存在；跨租户对象同样返回 404 以减少枚举 |
|       409 | 状态、版本、幂等参数冲突                  |
|       422 | 可定位字段的语义校验失败                  |
|       429 | 限流，带 `Retry-After`                    |
|       503 | 临时不可用，不泄露供应商细节              |

## 5. 幂等与批量限制

- 创建项目、提交分析、导入、重试、Agent Action 执行、通知测试等可能重复提交的写操作接受 `Idempotency-Key`。
- 服务端保存 key、调用者、规范化请求哈希、响应引用和过期时间；同 key 不同参数返回 409。
- 批量接口必须指定最大数量；P0 默认最多 100 项。首期不提供门店 CSV 导入。
- 重试接口创建新的 attempt，不覆盖原 ModelRun 事实记录。

## 6. 查询规范

- 默认 cursor 分页；后台复杂报表可用明确的 offset 分页。
- 排序采用 `sort=-createdAt,name`，仅允许白名单字段。
- 时间范围必须有上限；导出大数据走异步任务。
- 搜索字符串长度和通配范围受限，防止全表扫描。

## 7. P0 用户端接口

以下在 PRD 草案上补充了版本前缀和关键子资源；实现时使用 OpenAPI 生成/校验 DTO。

```text
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/:projectId
PATCH  /api/v1/projects/:projectId
POST   /api/v1/projects/:projectId/archive-actions
POST   /api/v1/projects/:projectId/restore-actions
POST   /api/v1/projects/:projectId/identification-jobs
GET    /api/v1/projects/:projectId/identification-jobs/:jobId
POST   /api/v1/projects/:projectId/identification-confirmations
POST   /api/v1/projects/:projectId/brand-candidates
DELETE /api/v1/projects/:projectId/brand-candidates/:candidateId

POST   /api/v1/projects/:projectId/sources
PATCH  /api/v1/projects/:projectId/sources/:sourceId
DELETE /api/v1/projects/:projectId/sources/:sourceId
POST   /api/v1/projects/:projectId/sources/:sourceId/fetch-actions
GET    /api/v1/projects/:projectId/sources/:sourceId/snapshots

GET    /api/v1/projects/:projectId/prompts
POST   /api/v1/projects/:projectId/prompt-generation-jobs
POST   /api/v1/projects/:projectId/prompts
PATCH  /api/v1/projects/:projectId/prompts/:promptId
DELETE /api/v1/projects/:projectId/prompts/:promptId
GET    /api/v1/projects/:projectId/prompts/:promptId/versions
POST   /api/v1/projects/:projectId/prompts/import-actions
POST   /api/v1/projects/:projectId/prompts/:promptId/variant-actions

POST   /api/v1/projects/:projectId/analysis-estimates
POST   /api/v1/projects/:projectId/usage-reservations
POST   /api/v1/projects/:projectId/analysis-jobs
GET    /api/v1/projects/:projectId/analysis-jobs
GET    /api/v1/analysis-jobs/:jobId
GET    /api/v1/analysis-jobs/:jobId/model-runs
POST   /api/v1/analysis-jobs/:jobId/cancellation
POST   /api/v1/analysis-jobs/:jobId/retries

GET    /api/v1/projects/:projectId/scores
GET    /api/v1/projects/:projectId/reports
GET    /api/v1/projects/:projectId/reports/:versionId
POST   /api/v1/projects/:projectId/reports/:versionId/publish
POST   /api/v1/projects/:projectId/reports/:versionId/archive
GET    /api/v1/projects/:projectId/competitors
PATCH  /api/v1/projects/:projectId/competitors/:competitorId

GET    /api/v1/notifications
PATCH  /api/v1/notifications/:notificationId/read
GET    /api/v1/workspaces/:workspaceId/usage
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
PATCH  /api/v1/workspaces/:workspaceId
GET    /api/v1/workspaces/:workspaceId/members
POST   /api/v1/workspaces/:workspaceId/invitations
GET    /api/v1/workspaces/:workspaceId/invitations
POST   /api/v1/workspace-invitations/accept-actions
PATCH  /api/v1/workspaces/:workspaceId/members/:memberId
DELETE /api/v1/workspaces/:workspaceId/members/:memberId
```

P1/P2 增加门店、品牌管家、优化任务、报告导出/分享等；在对应 Epic 开始前补充 OpenAPI。

## 8. P0 管理端接口

```text
GET    /api/v1/admin/dashboard
GET    /api/v1/admin/users
GET    /api/v1/admin/projects
GET    /api/v1/admin/tasks
PATCH  /api/v1/admin/users/:userId/status
POST   /api/v1/admin/workspaces/:workspaceId/quota-adjustments

GET    /api/v1/admin/model-providers
PATCH  /api/v1/admin/model-providers/:providerId/status
PUT    /api/v1/admin/model-providers/:providerId/credential
PUT    /api/v1/admin/model-configs/:modelConfigId
POST   /api/v1/admin/model-configs/:modelConfigId/probe
GET    /api/v1/admin/model-calls

GET    /api/v1/admin/agent-runs
POST   /api/v1/admin/agent-runs
GET    /api/v1/admin/audit-logs

GET    /api/v1/admin/notification-channels/telegram
PUT    /api/v1/admin/notification-channels/telegram
POST   /api/v1/admin/notification-channels/telegram/test
GET    /api/v1/admin/notification-deliveries

GET    /api/v1/admin/data-lifecycle/legal-holds
POST   /api/v1/admin/data-lifecycle/legal-holds
POST   /api/v1/admin/data-lifecycle/legal-holds/:holdId/release
```

## 9. 异步状态更新

P0 可先使用带 ETag 的轮询，间隔由服务端 `pollAfterMs` 建议。若使用 SSE：事件只作为刷新提示，客户端重连后必须 GET 事实状态；事件需带单调序号，不能假定恰好一次投递。

## 10. OpenAPI 与契约测试

- 当前实现由 Nest 路由生成 `docs/generated/openapi.json`，并用 `openapi-typescript` 生成 `packages/api-client/src/generated/openapi.ts`；`npm run openapi:check` 检查产物漂移。E3–E11 的公开路由均已接入；OpenClaw 回调使用排除在公开契约之外的内网专用路由。
- API DTO 与 OpenAPI 应保持同源；新增业务端点时必须补齐请求/响应 schema，前端优先消费生成类型，不在页面重复定义协议字段。
- 共享 API 客户端统一设置 credentialed Cookie、CSRF、设备 ID、请求 ID，并在工作区切换时清空缓存且拒绝旧工作区在途响应。
- Provider Webhook（若后续存在）需签名、时间窗、防重放和原始 body 验证。
- Skill 内部接口同样定义机器可校验 schema，不以自然语言代替参数校验。

## 11. 稳定错误码基线

P0 至少固定以下 code：`AUTH_REQUIRED`、`AUTH_CODE_INVALID`、`AUTH_CODE_EXPIRED`、`AUTH_STEP_UP_REQUIRED`、`CSRF_INVALID`、`FORBIDDEN`、`RESOURCE_NOT_FOUND`、`VALIDATION_FAILED`、`CONCURRENT_MODIFICATION`、`LAST_OWNER_REQUIRED`、`IDEMPOTENCY_CONFLICT`、`RATE_LIMITED`、`ANALYSIS_QUOTA_INSUFFICIENT`、`ANALYSIS_NOT_CANCELLABLE`、`PROVIDER_UNAVAILABLE`、`PROVIDER_NATIVE_WEB_SEARCH_UNSUPPORTED`、`EXTERNAL_DEPENDENCY_UNAVAILABLE`、`LEGAL_HOLD_SCOPE_NOT_FOUND`、`DATA_LIFECYCLE_TIMEOUT`。新增 code 需同步 OpenAPI、前端错误映射和契约测试。
