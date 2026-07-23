# 部署基线

## Cloudflare Pages

创建三个 Pages 项目并连接同一 GitHub 仓库。均使用仓库根目录作为 Root directory，避免 npm workspace 依赖缺失。

| 项目                | 构建命令                | 输出目录            | 生产域名             |
| ------------------- | ----------------------- | ------------------- | -------------------- |
| `yingchuan-website` | `npm run build:website` | `apps/website/dist` | `chatway.chat`       |
| `yingchuan-web`     | `npm run build:web`     | `apps/web/dist`     | `app.chatway.chat`   |
| `yingchuan-admin`   | `npm run build:admin`   | `apps/admin/dist`   | `admin.chatway.chat` |

Web/Admin 两个项目生产环境均设置公开构建变量 `VITE_API_BASE_URL=https://api.chatway.chat`；客户端会自行追加 `/api/v1`。Website 不设置 API 变量，只跳转用户端。Preview 环境只能使用独立 staging API；未提供 staging 时留空，禁止连接生产 API。Website watch path 使用 `apps/website/*, package.json, package-lock.json`；Web 使用 `apps/web/*, packages/ui/*, packages/shared-types/*, package.json, package-lock.json`；Admin 对应替换为 `apps/admin/*`。

项目不得包含顶层 `404.html`，由 Pages 的静态 SPA 默认行为处理深层路由。不创建 Functions、Workers、KV、D1 或 R2 绑定。

## 云服务器

服务器预留 `/opt/yingchuan`（部署文件）、`/srv/yingchuan`（数据）和 `/etc/yingchuan/secrets`（密钥）。`production.env` 只存放 `IMAGE_PREFIX`、`ADMIN_ALLOWED_EMAILS=geyaovip@163.com` 和资源上限等非密钥配置。数据库与 Redis 连接串分别放入 `database_url`、`redis_url`，PostgreSQL 密码放入 `postgres_password`；Redis ACL 从 `redis-users.acl.example` 生成后保存为 `redis_acl`。认证 HMAC pepper、Resend API Key、OpenClaw Gateway Token、模型密钥主密钥和通知密钥主密钥分别放入 `auth_pepper`、`resend_api_key`、`openclaw_gateway_token`、`model_credential_master_key`、`notification_credential_master_key`。当前共享服务器使用 `root:docker`、密钥目录 `0750`、目录内文件 `0644`：宿主机普通用户无法遍历密钥目录，容器中的非 root 应用用户则可读取 Compose 只读挂载的 secret；应用只通过 `*_FILE` 入口读取密钥。

所有命令必须同时带 `COMPOSE_PROJECT_NAME=yingchuan` 和 `--project-name yingchuan`。发布顺序是启动专属 PostgreSQL/Redis、运行一次性 migration、再只更新 API/Worker；禁止全局 Compose down、`docker system prune` 或影响其他项目的端口清理。

### 首次部署前

1. 以只读方式运行 `deploy/scripts/preflight.sh`，保存 CPU、内存、磁盘、端口、现有 Compose project 与目录盘点结果；先根据结果调整 `production.env` 中每个服务的 CPU/内存上限。
2. 创建映川专用部署密钥；部署账户只写入 `/opt/yingchuan` 并执行显式带 `--project-name yingchuan` 的 Compose 命令。服务器防火墙只允许 SSH 和映川 Caddy 使用的 80/443；API、数据库、Redis 与 OpenClaw 均不映射额外宿主端口。
3. 创建 `/srv/yingchuan/postgres`、`redis`、`private-files` 和 `backups/postgres`，以及 `/etc/yingchuan/secrets`。密钥目录与文件按上一节权限设置；数据目录所有者按对应容器 UID 设置，不能开放全局写权限。
4. 在 `production.env` 设置 `OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:2026.7.1@sha256:<经 staging 验证的摘要>`；发布工作流会拒绝浮动 tag、非官方镜像或缺少摘要的配置。
5. 当前宿主没有共享 Caddy，映川 Compose 因此使用独立、固定摘要的 Caddy 容器占用空闲的 80/443，并通过内部 `backend` 网络代理 `api:3000`。`api.chatway.chat` 使用 Cloudflare DNS-only A 记录，TLS 由该容器的 Let's Encrypt 自动签发和续期；不得改用已有 Cloudflare Tunnel。PostgreSQL、Redis 与 migration 只加入 internal `backend`；API/Worker 通过独立 `service_egress` 访问 Resend 和火山方舟，OpenClaw 通过单独的 `agent_egress` 出站。

### 发布与回滚

后端 Actions 只允许手动触发，并绑定 GitHub `production` Environment 保护。它先复用完整 CI，再用提交 SHA 构建不可变的 `api`、`worker`、`migrate` 镜像，随后验证 OpenClaw digest、执行迁移并滚动更新 API/Worker/OpenClaw。迁移容器必须断开标准输入，避免吞掉 SSH 发布脚本的剩余命令；上线后同时执行容器内 ready 检查与公网 HTTPS ready 检查。服务器需要在 `production.env` 中把 `IMAGE_PREFIX` 设为 `ghcr.io/<owner>/<repo>`。

若应用发布失败，用上一个已通过版本的提交 SHA 显式设置 `IMAGE_TAG`，仅重新拉取并更新 `api worker`。数据库迁移采用向前修复；不得回滚已执行的生产迁移文件。

### 备份与恢复演练

`yingchuan-postgres-backup.timer` 每日 03:20 UTC 执行 `deploy/scripts/backup-postgres.sh`，并在 30 分钟内随机错峰；输出是带 SHA-256 校验的自定义格式备份。至少每月对一份明确的备份执行 `deploy/scripts/verify-restore.sh /srv/yingchuan/backups/postgres/<file>.dump`；脚本只创建并删除固定的 `yingchuan_restore_verify` 数据库，不修改生产库。当前备份仍与服务器同机，不能覆盖整机或磁盘损坏风险。

## 外部授权清单

- GitHub：目标仓库、GHCR package 写权限、受保护 `production` Environment，以及 `DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_PRIVATE_KEY`、`DEPLOY_SSH_HOST_KEY`；
- Cloudflare：两个 Pages 项目、自定义域名和 `api.chatway.chat` 的 DNS-only A 记录均已完成；
- 共享服务器：已完成只读盘点、映川专用部署密钥、独立目录和受限资源配置；
- Resend：`mail.chatway.chat` 已完成 DNS 验证和投递 smoke，域名限定生产 API Key 已写入 `/etc/yingchuan/secrets/resend_api_key`；
- 火山方舟：生产加密凭据与 Provider 已配置；豆包、GLM、DeepSeek 已启用；Kimi-K2 模型广场页面存在，但当前账号尚无标准 API 可调用 Model ID，因此 Kimi 保持禁用；
- OpenClaw：允许拉取官方 GHCR 镜像，并确认 staging 验证后的 `2026.7.1` digest；
- Telegram：后台上线后由白名单管理员填写 Bot Token/Chat ID 并发送测试消息。
