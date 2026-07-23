# 开放问题

截至 2026-07-23，原 OQ-001 至 OQ-020 及本轮架构问题已确认，结论已进入 `decision-log.md`。当前没有阻塞工程初始化的产品或架构问题。

## 开始集成前需要提供的外部配置

这些是实施输入，不是产品决策；不得写入仓库或普通日志。

- Resend：已在独立账户创建并验证 `mail.chatway.chat`，Cloudflare DNS 自动配置已生效；`yingchuan-production` API Key 仅有该域名的 Sending access，已保存到本机钥匙串、写入共享服务器密钥文件，并通过 `映川 <login@mail.chatway.chat>` 向管理员邮箱投递 smoke；
- 模型：映川专用方舟 API Key 已创建并保存到本机钥匙串与生产加密凭据；生产 Provider 已启用豆包 `doubao-seed-2-1-turbo-260628`、GLM `glm-5-2-260617`、DeepSeek `deepseek-v4-pro-260425` 的 Responses 配置。Kimi-K2 当前快照已 Shutdown/Retiring 且不可调用，Kimi 配置保持禁用，等待方舟提供可用替代 Model ID；账户未开通 Web Search，因此四类配置均设 `nativeWebSearch=false`，不接外部搜索；
- Cloudflare：`app.chatway.chat` 和 `admin.chatway.chat` 的 Pages、自定义域、生产变量与 preview 隔离已完成；Resend DNS 记录已验证，`api.chatway.chat` 的 DNS-only A 记录已指向共享服务器；
- GitHub：私有仓库、`main` 分支、CI 和 `production` Environment 已完成；映川专用 SSH 密钥及主机指纹已配置；
- 共享云服务器：Ubuntu x86_64、2 核/1.9 GiB、根盘盘点时约 33 GiB 可用；已盘点并避开 4 个其他 Compose project。映川独立 API/Worker/PostgreSQL/Redis/OpenClaw/Caddy 已上线，只有 Caddy 发布 80/443，其他服务使用独立内网与受限出站网络，不使用现有 Cloudflare Tunnel；
- Telegram：E11-S3 管理页面已实现；生产后台上线后，由白名单管理员 `geyaovip@163.com` 在页面填写 Bot Token/Chat ID 并发送测试消息。

## 已完成的技术 Spike

- D-013：已验证 Transactional Outbox、InboxReceipt、幂等 jobId、重试/死信和 reconciliation，并在 `decision-log.md` 固化；
- D-014：已完成 Prompt/PromptVersion 拆表、不可变历史引用和数据库约束，并在 `decision-log.md` 固化；
- 两个 Vite SPA 的 Pages 构建、客户端深层路由刷新、自定义域名和 preview/生产 API 隔离已通过线上 smoke；
- 火山方舟密钥、模型列表、三类当前可用 Model ID、Responses API、Kimi 退役状态以及 Web Search `ToolNotOpen` 已完成真实账户验证；

## 仍需通过真实环境验证

- 方舟后续提供的可用 Kimi 替代 Model ID 及其 API 模式；
- OpenClaw `v2026.7.1` 生产 Gateway 已健康运行；仍需在真实运营任务中复核完整 Skill/会话/审计链路；

Spike 只允许确认实现细节；不得改变已接受的产品范围。如需改变，必须新增决策记录。
