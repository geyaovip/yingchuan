# 部署基线

## Cloudflare Pages

创建两个 Pages 项目并连接同一 GitHub 仓库。均使用仓库根目录作为 Root directory，避免 npm workspace 依赖缺失。

| 项目              | 构建命令              | 输出目录          | 生产域名             |
| ----------------- | --------------------- | ----------------- | -------------------- |
| `yingchuan-web`   | `npm run build:web`   | `apps/web/dist`   | `app.chatway.chat`   |
| `yingchuan-admin` | `npm run build:admin` | `apps/admin/dist` | `admin.chatway.chat` |

两个项目生产环境均设置公开构建变量 `VITE_API_BASE_URL=https://api.chatway.chat`；客户端会自行追加 `/api/v1`。Preview 环境只能使用独立 staging API；未提供 staging 时留空，禁止连接生产 API。Web watch path 使用 `apps/web/*, packages/ui/*, packages/shared-types/*, package.json, package-lock.json`；Admin 对应替换为 `apps/admin/*`。

项目不得包含顶层 `404.html`，由 Pages 的静态 SPA 默认行为处理深层路由。不创建 Functions、Workers、KV、D1 或 R2 绑定。

## 云服务器

服务器预留 `/opt/yingchuan`（部署文件）、`/srv/yingchuan`（数据）和 `/etc/yingchuan/secrets`（密钥）。`production.env` 权限必须为 `0600`，只存放 `IMAGE_PREFIX`、`ADMIN_ALLOWED_EMAILS=geyaovip@163.com`、资源上限和可调整的 `API_BIND_PORT` 等非密钥配置。数据库与 Redis 连接串分别放入权限为 `0600` 的 `database_url`、`redis_url`，PostgreSQL 密码放入 `postgres_password`；Redis ACL 从 `redis-users.acl.example` 生成后保存为 `redis_acl`。认证 HMAC pepper、Resend API Key、OpenClaw Gateway Token、模型密钥主密钥和通知密钥主密钥分别放入 `auth_pepper`、`resend_api_key`、`openclaw_gateway_token`、`model_credential_master_key`、`notification_credential_master_key`。应用只通过 Compose secrets 的 `*_FILE` 入口读取密钥。

所有命令必须同时带 `COMPOSE_PROJECT_NAME=yingchuan` 和 `--project-name yingchuan`。发布顺序是启动专属 PostgreSQL/Redis、运行一次性 migration、再只更新 API/Worker；禁止全局 Compose down、`docker system prune` 或影响其他项目的端口清理。

### 首次部署前

1. 以只读方式运行 `deploy/scripts/preflight.sh`，保存 CPU、内存、磁盘、端口、现有 Compose project 与目录盘点结果；先根据结果调整 `production.env` 中每个服务的 CPU/内存上限。
2. 创建最小权限部署账户，只允许写入 `/opt/yingchuan` 并执行映川专用 Compose 命令；不得授予任意免密 root shell。服务器防火墙只允许 SSH 和共享 Caddy 使用的 80/443，`18080` 仅绑定 `127.0.0.1`，数据库与 Redis不映射宿主端口。
3. 创建 `/srv/yingchuan/postgres`、`redis`、`private-files` 和 `backups/postgres`，以及 `/etc/yingchuan/secrets`。密钥目录与文件分别使用 `0700`、`0600`；数据目录所有者按对应容器 UID 设置，不能开放全局写权限。
4. 在 `production.env` 设置 `OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:2026.7.1@sha256:<经 staging 验证的摘要>`；发布工作流会拒绝浮动 tag、非官方镜像或缺少摘要的配置。
5. 将 `deploy/caddy/Caddyfile.example` 合并到宿主现有 Caddy 配置并验证后 reload。`api.chatway.chat` 使用 Cloudflare DNS-only A/AAAA 记录，TLS 在宿主 Caddy 终止。

### 发布与回滚

后端 Actions 只允许手动触发，并绑定 GitHub `production` Environment 保护。它先复用完整 CI，再用提交 SHA 构建不可变的 `api`、`worker`、`migrate` 镜像，随后验证 OpenClaw digest、执行迁移并滚动更新 API/Worker/OpenClaw。服务器需要在 `production.env` 中把 `IMAGE_PREFIX` 设为 `ghcr.io/<owner>/<repo>`。

若应用发布失败，用上一个已通过版本的提交 SHA 显式设置 `IMAGE_TAG`，仅重新拉取并更新 `api worker`。数据库迁移采用向前修复；不得回滚已执行的生产迁移文件。

### 备份与恢复演练

使用 root 或专用备份账户通过 systemd timer 每日执行 `deploy/scripts/backup-postgres.sh`，输出自带 SHA-256 校验的自定义格式备份。至少每月对一份明确的备份执行 `deploy/scripts/verify-restore.sh /srv/yingchuan/backups/postgres/<file>.dump`；脚本只创建并删除固定的 `yingchuan_restore_verify` 数据库，不修改生产库。当前备份仍与服务器同机，不能覆盖整机或磁盘损坏风险。

## 外部授权清单

- GitHub：目标仓库、GHCR package 写权限、受保护 `production` Environment，以及 `DEPLOY_HOST`、`DEPLOY_PORT`、`DEPLOY_USER`、`DEPLOY_SSH_PRIVATE_KEY`、`DEPLOY_SSH_HOST_KEY`；
- Cloudflare：创建两个 Pages 项目、自定义域名，以及 `api.chatway.chat` 的 DNS-only 记录；
- 共享服务器：只读盘点和部署 SSH 入口、宿主 Caddy 配置位置、允许使用的回环端口、数据盘路径与资源额度。
- Resend：`mail.chatway.chat` 已完成 DNS 验证和投递 smoke，域名限定生产 API Key 已保存到本机钥匙串；服务器就绪后写入 `/etc/yingchuan/secrets/resend_api_key`；
- 火山方舟：提供账户 API Key，并在管理端逐一选择、探测和启用豆包、Kimi、GLM、DeepSeek 的当前 Model ID；
- OpenClaw：允许拉取官方 GHCR 镜像，并确认 staging 验证后的 `2026.7.1` digest；
- Telegram：后台上线后由白名单管理员填写 Bot Token/Chat ID 并发送测试消息。
