# 开放问题

截至 2026-07-22，原 OQ-001 至 OQ-020 及本轮架构问题已确认，结论已进入 `decision-log.md`。当前没有阻塞工程初始化的产品或架构问题。

## 开始集成前需要提供的外部配置

这些是实施输入，不是产品决策；不得写入仓库或普通日志。

- Resend：当前账户免费套餐只允许一个域名且额度已被其他项目使用；需要产品负责人授权升级 Pro（后台显示 `$20/月`），或提供另一个有空余域名额度的 Resend 账户。随后创建 `mail.chatway.chat`、写入 DNS 验证记录并生成服务端 API Key；发件人已定为 `映川 <login@mail.chatway.chat>`；
- 模型：火山方舟账户已确认开通豆包、Kimi、GLM、DeepSeek 四类模型且有可用额度；待共享服务器密钥路径就绪后生成映川专用 API Key，并记录实测通过的 Model ID；不需要其他原厂账户；
- Cloudflare：`app.chatway.chat` 和 `admin.chatway.chat` 的 Pages、自定义域、生产变量与 preview 隔离已完成；`api.chatway.chat` 的 DNS-only 记录等待共享服务器公网 IP，Resend DNS 记录等待域名创建；
- GitHub：私有仓库、`main` 分支和 CI 已完成；生产 Actions 环境等待共享服务器 SSH 信息与密钥；
- 共享云服务器：系统版本、CPU/内存/磁盘、已有 Compose project/端口/反向代理规则、独立数据/备份目录与 SSH 管理方式；
- Telegram：E11-S3 管理页面已实现；生产后台上线后，由白名单管理员 `geyaovip@163.com` 在页面填写 Bot Token/Chat ID 并发送测试消息。

## 已完成的技术 Spike

- D-013：已验证 Transactional Outbox、InboxReceipt、幂等 jobId、重试/死信和 reconciliation，并在 `decision-log.md` 固化；
- D-014：已完成 Prompt/PromptVersion 拆表、不可变历史引用和数据库约束，并在 `decision-log.md` 固化；
- 两个 Vite SPA 的 Pages 构建、客户端深层路由刷新、自定义域名和 preview/生产 API 隔离已通过线上 smoke；

## 仍需通过真实环境验证

- 火山方舟账户下四类 Model ID 的可用性、Responses/Chat API 模式、内置 Web Search 兼容性、错误码和计费返回；
- OpenClaw `v2026.7.1` 与 Agent Gateway 的 Skill/会话/审计适配；

Spike 只允许确认实现细节；不得改变已接受的产品范围。如需改变，必须新增决策记录。
