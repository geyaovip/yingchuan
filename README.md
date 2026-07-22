# 映川

映川是 AI 品牌可见度分析与持续运营管理平台。本仓库已进入 MVP 开发阶段。

## 从这里开始

1. 阅读 [`docs/README.md`](docs/README.md)，按任务路由选择最小上下文，不要一次加载全部文档。
2. 阅读 [`AGENTS.md`](AGENTS.md)，遵守实现边界与交付检查。
3. 开始某个功能前，在 [`docs/delivery/mvp-backlog.md`](docs/delivery/mvp-backlog.md) 中确认 Story、依赖和验收条件。
4. 遇到未确定事项时，不要自行固化为代码，先查看 [`docs/delivery/open-questions.md`](docs/delivery/open-questions.md) 和 [`docs/delivery/decision-log.md`](docs/delivery/decision-log.md)。

## 当前阶段

- 已有输入：[`docs/product/prd-v3.md`](docs/product/prd-v3.md)（PRD V3.0 快照，2026-07-22 收录）。
- 当前产物：MVP Epic 0–11 已实现，覆盖身份与工作区、项目与 Prompt、火山方舟四模型、分析编排、解析评分、版本化报告、管理后台、受控 OpenClaw 运营助手、站内通知与 Telegram 管理配置，以及带法律保留和审计的数据生命周期任务。
- 当前阶段：本地功能与自动化验收已完成；生产联调需要配置 Resend、火山方舟 Model ID/API Key、OpenClaw 固定镜像摘要、Telegram Bot，以及 GitHub/Cloudflare/共享服务器授权。

## 本地开发

需要 Node.js 22、npm 10 和 Docker Desktop。首次启动：

```bash
cp .env.example .env
npm install
npm run deps:up
npm run dev
```

`deps:up` 只启动映川自己的开发 PostgreSQL、测试 PostgreSQL 和 Redis，并显式使用 Compose project `yingchuan`。默认仅监听本机 `55432`、`55433` 和 `56379`，不会操作其他项目的容器、网络或数据卷。私有文件保存在 `storage/private/`，目录内容不进入 Git。

- 用户端：`http://localhost:5173`
- 管理端：`http://localhost:5174`
- API 健康检查：`http://localhost:3000/api/v1/health`
- API 就绪检查：`http://localhost:3000/api/v1/ready`
- API 指标：`http://localhost:3000/api/v1/metrics`
- OpenAPI JSON：`http://localhost:3000/api/openapi.json`
- API 文档：`http://localhost:3000/api/docs`

认证 API 在生产只接受 `app.chatway.chat` 与 `admin.chatway.chat`，开发模式额外接受本机 Vite 端口。真实邮件联调前需配置 Resend；自动化测试使用内存邮件适配器，不发送外部邮件。管理端白名单固定由服务端 `ADMIN_ALLOWED_EMAILS` 校验，默认仅 `geyaovip@163.com`。

常用质量检查：

```bash
npm run check
```

该命令依次运行格式、Lint、类型检查、单元/集成测试、构建、OpenAPI 生成一致性、文档和密钥检查。
CI 还会在空 PostgreSQL 中验证迁移、重复部署迁移、加载测试 fixture、审计生产依赖并扫描当前文件与完整 Git 历史中的密钥。

本地依赖管理：

```bash
npm run deps:status
npm run deps:logs
npm run deps:down
```

`deps:down` 只停止并移除 `yingchuan` Compose project 的容器和网络，默认保留 PostgreSQL、Redis 数据卷。

数据库迁移与测试 fixture：

```bash
npm run db:migrate:dev -- --name migration_name
npm run db:migrate:test
npm run db:fixtures:test
```

测试 fixture 只能写入名为 `yingchuan_test` 的数据库；生产环境和开发数据库都会被代码拒绝。火山方舟的四类测试模型配置默认禁用，使用虚构 Model ID，不能冒充真实接入。

本地凭证加密使用 `MODEL_CREDENTIAL_MASTER_KEY`（至少 32 字符）和 `MODEL_CREDENTIAL_KEY_VERSION`。生产值必须由服务器 Secret/受限文件注入，不得复用 `.env.example` 占位值。方舟 API Key 仅能由管理员在二次邮箱验证窗口内覆盖，不会回显。

## 产品边界

首期采用模块化单体与异步 Worker。Agent 只能通过受控 Skill 调用业务服务；不直连数据库、不读取密钥，也不能执行高风险操作。
