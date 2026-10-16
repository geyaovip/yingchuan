# 映川 · AI 品牌可见度分析平台

面向品牌与运营团队的 GEO（生成式引擎优化）分析平台，围绕“监测品牌表现、分析回答与引用、制定优化任务、跟踪执行结果”组织工作。通过项目、问题集与多模型分析，沉淀可追溯的品牌可见度报告。

[产品官网](https://chatway.chat/) · [应用工作台](https://app.chatway.chat/) · [管理后台](https://admin.chatway.chat/) · [项目文档](docs/README.md)

官网可直接浏览；工作台与管理后台按账号权限访问，管理端需要服务端白名单授权。

## 核心功能

| 模块           | 功能说明                                                         |
| -------------- | ---------------------------------------------------------------- |
| 项目与问题集   | 按工作区管理品牌项目、监测问题和分析配置。                       |
| 多模型分析     | 通过统一模型网关组织火山方舟模型调用，记录执行状态、用量与错误。 |
| 回答与引用分析 | 查看模型回答、品牌表现、引用来源与分析洞察。                     |
| 报告与趋势     | 保存带评分版本的分析结果，供报告查看与历史对照。                 |
| 优化任务       | 将分析发现转为可跟踪的运营任务，关联通知与执行状态。             |
| 运营管理       | 提供管理后台、审计记录、通知配置及数据生命周期管理。             |

## 工程设计

- **模块化单体与独立 Worker**：业务模块保持明确边界，分析编排和异步任务由 Worker 承担。
- **统一模型网关**：供应商调用、模型配置、凭据保护和用量记录集中处理。
- **服务端工作区隔离**：页面、运营助手与 Worker 通过应用服务执行业务，统一校验权限。
- **任务可靠性**：异步任务包含幂等、超时、有限重试和审计关联。
- **评分可追溯**：报告携带评分版本，避免把不同口径的结果直接合并为趋势。

## 技术栈与目录

| 层级                 | 技术 / 目录                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| 用户端、管理端、官网 | React、TypeScript、Vite；`apps/web`、`apps/admin`、`apps/website`          |
| API                  | NestJS；`apps/api`                                                         |
| 异步任务             | `apps/worker`                                                              |
| 业务与基础能力       | `packages/analysis`、`packages/model-gateway`、`packages/reports` 等共享包 |
| 数据与队列           | PostgreSQL、Prisma、Redis、BullMQ                                          |
| 工程管理             | npm workspaces、Turborepo、Vitest、GitHub Actions                          |

## 本地运行

需要 Node.js 22、npm 10 和 Docker。

```bash
git clone https://github.com/geyaovip/yingchuan.git
cd yingchuan
cp .env.example .env
npm ci
npm run deps:up
npm run dev
```

按 `.env.example` 配置本地数据库与必要密钥。依赖脚本仅操作 `yingchuan` Compose 项目；数据库迁移和测试数据的使用方式见仓库脚本与[开发文档](docs/README.md)。

| 服务         | 本地地址                            |
| ------------ | ----------------------------------- |
| 应用工作台   | http://localhost:5173               |
| 管理后台     | http://localhost:5174               |
| API 健康检查 | http://localhost:3000/api/v1/health |
| API 就绪检查 | http://localhost:3000/api/v1/ready  |
| API 文档     | http://localhost:3000/api/docs      |

## 开发检查

```bash
npm run check
npm run deps:status
```

`check` 包含格式、Lint、类型、测试、构建、OpenAPI 一致性、文档与密钥检查。测试数据仅用于独立测试数据库，不应写入生产环境。

## 配置与交付说明

真实模型分析需要配置火山方舟 Model ID 与 API Key；邮件、Telegram 和运营助手分别依赖相应服务配置。测试适配器与示例 Model ID 不代表外部服务已接通。模型凭据只在服务端加密保存，运营助手通过受控 Skill 执行授权动作。

当前功能范围、实施记录与交付条件见[开发任务清单](docs/delivery/mvp-backlog.md)和[决策记录](docs/delivery/decision-log.md)。公开入口可访问与具体租户的业务验收分别核对。
