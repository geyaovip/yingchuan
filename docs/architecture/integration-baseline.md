# 外部服务接入基线

> 本文只在认证、Provider、部署或 OpenClaw 集成任务中按需加载。模型名称、价格和能力可能变化，运行时配置必须版本化，不把网页当前值写死为永久业务规则。

## 1. Resend

- 用途：发送邮箱登录验证码；Resend 不负责用户身份和 Session。
- 发件域名固定为 `mail.chatway.chat`，发件前在 Resend 后台创建域名，再在 Cloudflare DNS 添加 Resend 给出的验证记录。不猜测或手写 DNS 值，以 Resend 当时展示为准。
- 发送请求使用 `Idempotency-Key`，业务侧仍需维护验证码 challenge 幂等和限流。
- 发件人：`映川 <login@mail.chatway.chat>`。P0 验证码邮件不要求用户直接回复；客服回复地址在实际邮箱准备后另配置。

官方资料：

- https://resend.com/docs/send-with-nodejs
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend

## 2. 模型 Provider：统一火山方舟

- P0 只配置一个 Provider：`volcengine_ark`；使用同一火山方舟账户/API Key 调用该账户实际已开通的豆包、Kimi、GLM、DeepSeek 模型。不再直接接入 Moonshot、智谱或 DeepSeek 开放平台账户。
- `providerCode` 与 `modelFamily` 分开：Provider 统一为 `volcengine_ark`，`modelFamily` 取 `doubao | kimi | glm | deepseek`。具体 `modelCode/endpointId` 必须从当前火山账户的模型列表/控制台选择并在 staging 实测，不从品牌名猜测、不写死长期 Model ID。
- 每个 ModelConfig 至少保存：`providerCode`、`modelFamily`、`modelCode/endpointId`、显示名、API 模式、`nativeWebSearch`、内置联网工具参数、上下文、价格版本、并发、超时、状态和探测时间。AnalysisJob 创建时冻结完整快照。
- “原生联网”在本项目中指：火山方舟对该具体 Model ID/API 模式官方暴露的内置 Web Search/联网工具，并与同一次模型调用绑定。不使用外部搜索 API、自建共享检索、MCP 搜索或其他模型代搜。
- 能力以“具体 Model ID + API 模式 + 当前账户权限”实测为准，不因 Kimi/GLM/DeepSeek 原厂提供联网就假设火山托管版同样可用。`nativeWebSearch=false` 时跳过该联网组合，非联网 Prompt 仍正常运行。
- 火山方舟成为 P0 的单一外部模型故障域：单个 Model ID 失败只影响对应 Run；账户、API Key、配额或区域级故障可影响全部四类模型。P0 不自动切到原厂 API，只做部分成功、明确报错和人工恢复。

2026-07-23 账户实测快照（运行时仍以后续管理端探测为准）：

| 模型族   | Model ID                       | API 模式  | 结果                                                                                                                                          |
| -------- | ------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 豆包     | `doubao-seed-2-1-turbo-260628` | Responses | 基础调用通过；账户未开通 Web Search，`nativeWebSearch=false`                                                                                  |
| GLM      | `glm-5-2-260617`               | Responses | 基础调用通过；Web Search 返回 `ToolNotOpen`，`nativeWebSearch=false`                                                                          |
| DeepSeek | `deepseek-v4-pro-260425`       | Responses | 基础调用通过；Web Search 返回 `ToolNotOpen`，`nativeWebSearch=false`                                                                          |
| Kimi     | 无当前可用 ID                  | 禁用      | 模型广场有 Kimi-K2 详情页，但体验中心与预置推理列表无 Kimi；`kimi-k2`、`kimi-k2-250711` 标准 API 实测均返回 `InvalidEndpointOrModel.NotFound` |

映川专用方舟 Key 仅授权 Model ID 范围并保存在本机钥匙串；共享服务器就绪后写入服务端密钥系统。账户未开通 Web Search 时不购买或调用其他搜索能力，所有需要联网的组合按 unsupported 跳过。

官方资料：

- https://www.volcengine.com/docs/82379/1330310
- https://www.volcengine.com/docs/82379/1958524
- https://www.volcengine.com/docs/82379/1756990

## 3. 地域输入

Prompt/Scope 声明需要地域时，按以下顺序获取：

1. 使用项目中已由用户确认的国家、省、市、区县或地标；
2. 信息不足时在分析配置页要求用户填写；
3. 用户可以保存为项目默认值或只用于本次任务；
4. 不允许由模型根据品牌名猜测地域后静默执行。

ModelRun 保存最终地域快照和注入方式，使不同模型在同一条件下可比较。

## 4. OpenClaw

- 版本：`v2026.7.1`，对应官方容器 `ghcr.io/openclaw/openclaw:2026.7.1`；部署时解析并固定 digest。
- 部署：云服务器独立容器，持久卷保存状态，仅 Agent Gateway 内网可访问。
- 不开放 Control UI 到公网；不把 Docker socket、生产数据库、宿主文件系统或产品密钥挂入 Agent 容器。
- 集成协议：显式启用官方 `/v1/chat/completions`，`model=openclaw/default`；API 只传入 Skill 证据并设置单次 Token 上限。OpenClaw 的自定义模型 Provider 指向映川内网 `/api/v1/internal/model-gateway/v1`，再由统一 Model Gateway 调火山方舟；该内部接口使用同一 Gateway secret、排除在公开 OpenAPI 之外且不暴露公网。
- 安全策略：OpenClaw tools 全部 deny；共享 bearer token 视为完整 operator 凭证，只通过 Compose secret 注入。生产镜像必须为官方 `2026.7.1@sha256:...`，GitHub 发布工作流拒绝 tag-only 配置。
- 更新：staging 验证 Skill、会话、审计和回滚后人工升级；禁止自动跟随 `latest`。

官方资料：

- https://github.com/openclaw/openclaw/releases/tag/v2026.7.1
- https://docs.openclaw.ai/install/docker
- https://docs.openclaw.ai/gateway/openai-http-api
- https://docs.openclaw.ai/gateway/config-tools

## 5. Cloudflare Pages 与 GitHub

- Cloudflare 只承载 Website/Web/Admin 三个静态站点；不使用 Workers、Pages Functions、R2、KV、D1、Queues 或其他服务端能力。
- 官网是单页静态产品介绍；两个 Vite + React SPA 使用客户端路由和 Pages SPA fallback，验证 `/projects/:id` 等深层路由直接访问/刷新。
- Pages 必须从仓库根目录执行 `npm run build:website` / `npm run build:web` / `npm run build:admin`，输出目录分别为 `apps/website/dist` / `apps/web/dist` / `apps/admin/dist`。这些入口会先构建 workspace 依赖，不能直接运行单个应用 workspace 的 `build`。
- Pages 通过 GitHub 集成构建并提供预览部署；GitHub Actions 继续负责 lint、typecheck、test 和静态构建检查。
- 所有动态数据通过浏览器请求云服务器 API。前端只能包含公开 API 基址，不得嵌入 Resend、模型、Telegram、数据库或部署密钥。
- 生产官网为 `chatway.chat`，用户端为 `app.chatway.chat`，管理端为 `admin.chatway.chat`，后端为 `api.chatway.chat`。端到端测试必须使用自定义域名验证官网跳转以及用户/管理端 Session Cookie、CORS 和 CSRF。`api` 子域初期使用 Cloudflare DNS-only 记录直指云服务器，TLS 在 Caddy/Let's Encrypt 终止。
- staging 固定为 `staging-app.chatway.chat`、`staging-admin.chatway.chat`、`staging-api.chatway.chat` 并使用独立数据/密钥。只有这两个固定前端 Origin 可建立 staging 认证会话；动态 `*.pages.dev`/PR preview 只用于静态视觉验收，不连 staging/生产 API。

官方资料：

- https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/get-started/git-integration/
