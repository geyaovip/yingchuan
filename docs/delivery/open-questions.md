# 开放问题

截至 2026-07-22，原 OQ-001 至 OQ-020 及本轮架构问题已确认，结论已进入 `decision-log.md`。当前没有阻塞工程初始化的产品或架构问题。

## 开始集成前需要提供的外部配置

这些是实施输入，不是产品决策；不得写入仓库或普通日志。

- Resend：到 E1-S1 时登录 Resend 后台创建 `mail.chatway.chat`，取得当时的 DNS 验证记录与服务端 API Key；发件人已定为 `映川 <login@mail.chatway.chat>`；
- 模型：一个火山方舟账户/API Key/可用配额，以及该账户下实际已开通的豆包、Kimi、GLM、DeepSeek Model ID；不需要其他原厂账户；
- Cloudflare：到 E0-S7/E1-S1 需配置 Pages 自定义域名、`api` DNS 和 Resend DNS 记录时，再由产品负责人提供 `chatway.chat` 账户授权；
- GitHub：目标组织/仓库和 Actions 环境权限；
- 共享云服务器：系统版本、CPU/内存/磁盘、已有 Compose project/端口/反向代理规则、独立数据/备份目录与 SSH 管理方式；
- Telegram：E11-S3 管理页面已实现；生产后台上线后，由白名单管理员 `geyaovip@163.com` 在页面填写 Bot Token/Chat ID 并发送测试消息。

## 仍需通过技术 Spike 验证

- D-013：Transactional Outbox 和 reconciliation 的具体实现；
- D-014：Prompt/PromptVersion 拆表及历史引用；
- 火山方舟账户下四类 Model ID 的可用性、Responses/Chat API 模式、内置 Web Search 兼容性、错误码和计费返回；
- OpenClaw `v2026.7.1` 与 Agent Gateway 的 Skill/会话/审计适配；
- 两个 Vite SPA 的 Pages 构建、客户端深层路由刷新、自定义域名和 preview/生产 API 隔离测试。

Spike 只允许确认实现细节；不得改变已接受的产品范围。如需改变，必须新增决策记录。
