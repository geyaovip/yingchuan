# 映川产品需求文档（PRD）V3.0

> 文档用途：用于产品设计、技术方案评审，并可直接交给 Codex 作为开发依据。  
> 产品名称：映川  
> 产品类型：AI 品牌可见度分析与持续运营管理平台  
> 版本重点：统一品牌实体、动态认知源、多模型可见度检测、门店与本地分析、Agent 智能运营中心、Telegram 主动推送。  
> 默认时区：Asia/Shanghai，支持项目级时区覆盖。  
> 文档状态：可进入原型、技术设计和开发拆分阶段。

---

## 1. 文档说明

### 1.1 编写目标

本 PRD 用于统一产品、设计、前端、后端、算法、测试与运维团队对映川的理解，明确：

1. 产品解决什么问题；
2. 用户端与管理端包含哪些功能；
3. 品牌、门店、认知源、Prompt、模型运行、评分、报告和 Agent 如何关联；
4. 哪些逻辑必须由后端确定性实现，哪些工作交给 Agent；
5. Telegram 推送、定时任务、异常告警和智能处置如何落地；
6. 开发顺序、数据结构、权限、安全和验收标准。

### 1.2 本版本核心变化

相较于旧版按“品牌、单门店、连锁品牌”划分项目，本版本统一为：

```text
Project
└── Brand Entity
    ├── Store Entity（0 至 N 个）
    ├── Knowledge Sources（0 至 N 个）
    ├── Prompt Set（0 至 N 组）
    ├── Analysis Runs（0 至 N 次）
    └── Reports（0 至 N 份）
```

用户创建项目时不再选择企业类型。系统根据品牌名称自动识别其官网、门店、地图、本地生活平台、社交账号、文档站、代码仓库和其他认知源，再动态生成适用的分析模块。

---

## 2. 产品背景

AI 搜索、AI 问答和智能助手正在成为用户获取品牌、产品、服务和本地商家信息的新入口。企业通常无法回答以下问题：

- AI 是否知道我的品牌；
- AI 在什么问题下会推荐我；
- AI 对我的品牌描述是否准确；
- AI 推荐了哪些竞品；
- 不同模型的答案是否一致；
- 不同城市、商圈和门店的可见度是否不同；
- 官网、地图、点评和社交平台的信息是否影响 AI 的判断；
- 优化以后，AI 的推荐结果是否真的改善。

传统 SEO 工具主要分析搜索引擎关键词、排名和网页流量，无法完整覆盖 AI 模型中的品牌提及、推荐顺位、事实准确性、门店识别和回答倾向。

映川的目标不是只生成一次检测报告，而是持续完成：

```text
识别品牌认知资产
→ 生成真实用户问题
→ 调用多个 AI 模型检测
→ 解析提及、推荐、排名和事实
→ 形成统一可见度评分
→ 给出优化任务
→ 持续复测
→ 主动发现异常并推送
```

---

## 3. 产品定位与目标

### 3.1 产品定位

映川是一款帮助品牌和本地商家分析、管理并提升自身在 AI 搜索与问答场景中可见度的产品。

### 3.2 一句话介绍

> 看见 AI 如何理解和推荐你的品牌，并持续推动优化。

### 3.3 核心价值

对品牌用户：

- 看见不同 AI 模型如何描述和推荐品牌；
- 找出缺失、错误和落后的认知；
- 明确应该优先优化什么；
- 跟踪优化前后的变化。

对连锁与本地商家：

- 分析不同城市、区域和门店的 AI 可见度；
- 发现门店信息不一致、重复、遗漏或过期；
- 找到本地推荐场景中的竞争差距。

对平台运营团队：

- 通过管理 Agent 分析系统、模型、成本、用户和业务数据；
- 自动生成日报、周报和异常告警；
- 通过 Telegram 主动推送关键问题；
- 在权限控制下执行低风险操作。

### 3.4 非目标

首期不做：

- 通用 SEO 排名平台；
- 面向所有行业的完整舆情监控；
- 完整 CRM；
- 自动替用户发布所有外部平台内容；
- 直接替代企业官网 CMS；
- 无人工确认的大规模高风险自动操作。

---

## 4. 用户角色

### 4.1 品牌管理员

负责创建项目、配置品牌、查看报告、管理 Prompt、认知源和优化任务。

### 4.2 品牌运营成员

查看分析结果、执行优化任务、管理内容草稿和门店资料。

### 4.3 连锁运营人员

管理大量门店、城市和区域分析，查看门店差异和异常。

### 4.4 企业决策者

关注核心评分、趋势、竞品、风险和经营摘要，不参与复杂配置。

### 4.5 平台超级管理员

管理用户、套餐、模型、任务、成本、系统配置、告警、Agent 和推送渠道。

### 4.6 平台运营人员

查看用户增长、转化、行业分布、产品使用情况和客服辅助信息。

### 4.7 平台客服人员

处理用户任务、报告、额度、订单和品牌识别问题，使用 Agent 生成回复草稿。

---

## 5. 产品总体架构

```text
品牌认知资产层
品牌 / 门店 / 官网 / 地图 / 本地生活平台 / 社交账号 / 文档 / 代码仓库

↓

检测配置层
Prompt / Scope / 城市 / 门店 / 模型 / 语言 / 频率

↓

分析执行层
任务编排 / 模型调用 / 响应存储 / 实体解析 / 竞品识别 / 成本记录

↓

结果层
AI Visibility Score / 维度评分 / 趋势 / 竞品 / 问题 / 报告

↓

优化执行层
优化建议 / 任务 / 内容草稿 / 门店整改 / 复测

↓

Agent 智能层
品牌管家 / 运营助手 / 定时报告 / 异常分析 / Telegram 推送 / 智能处置
```

---

## 6. 信息架构

### 6.1 用户端导航

1. 工作台
2. 项目
3. 分析任务
4. 报告
5. 优化任务
6. 通知中心
7. 套餐与用量
8. 团队与权限
9. 设置

进入项目后，二级导航根据识别结果动态生成：

- 项目概览；
- 品牌信息；
- AI 可见度；
- Prompt；
- 竞品；
- 官网；
- 认知源；
- 门店；
- 城市与区域；
- 优化建议；
- 历史报告；
- 品牌管家；
- 项目设置。

如果项目没有门店，不展示门店和城市模块；如果没有官网，不展示官网专项模块。

### 6.2 管理后台导航

1. 管理首页
2. 用户与团队
3. 项目管理
4. 品牌与门店数据
5. 认知源管理
6. Prompt 模板
7. 分析任务
8. 模型与供应商
9. 报告与评分
10. 订单与套餐
11. 数据质量
12. 客服工作台
13. 智能监控
14. 映川运营助手
15. 告警规则
16. 推送中心
17. Agent 运行记录
18. 系统配置
19. 审计日志

---

## 7. 核心数据模型

### 7.1 Project

一个用户创建的业务分析项目。

核心字段：

- id；
- workspaceId；
- name；
- brandEntityId；
- industryId；
- defaultCountry；
- defaultLanguage；
- timezone；
- status；
- onboardingStatus；
- createdBy；
- createdAt；
- updatedAt。

状态：

```text
draft
→ identifying
→ waiting_confirmation
→ ready
→ analyzing
→ active
→ archived
```

### 7.2 BrandEntity

品牌主实体，不代表“线上品牌”或“连锁品牌”类型。

核心字段：

- canonicalName；
- aliases；
- logoUrl；
- description；
- industryId；
- headquarters；
- serviceRegions；
- foundedYear；
- officialWebsite；
- verificationStatus；
- confidenceScore；
- metadata。

### 7.3 StoreEntity

门店实体，一个品牌可以没有门店，也可以有大量门店。

核心字段：

- brandEntityId；
- name；
- externalStoreCode；
- country；
- province；
- city；
- district；
- address；
- longitude；
- latitude；
- businessArea；
- landmark；
- phone；
- businessHours；
- services；
- status；
- isPriority；
- sourceConfidence；
- lastVerifiedAt。

门店状态：

- pending；
- active；
- temporarily_closed；
- permanently_closed；
- duplicate；
- needs_review。

### 7.4 KnowledgeSource

品牌认知源，是整个系统扩展能力的核心。

类型示例：

- official_website；
- docs；
- github；
- map_amap；
- map_baidu；
- map_google；
- meituan；
- dianping；
- douyin；
- wechat_official；
- x；
- linkedin；
- app_store；
- news；
- encyclopedia；
- ecommerce；
- custom。

核心字段：

- projectId；
- brandEntityId；
- storeEntityId（可选）；
- type；
- name；
- url；
- externalId；
- status；
- verificationStatus；
- confidenceScore；
- lastFetchedAt；
- lastChangedAt；
- contentSnapshotId；
- metadata。

状态：

- discovered；
- confirmed；
- rejected；
- unavailable；
- outdated；
- needs_review。

### 7.5 Prompt

用于模拟用户向 AI 提问的问题。

核心字段：

- projectId；
- text；
- normalizedText；
- category；
- scope；
- country；
- province；
- city；
- district；
- nearbyLandmark；
- targetStoreId；
- language；
- source；
- priority；
- enabled；
- version；
- createdBy。

Prompt 分类：

- brand_awareness；
- recommendation；
- comparison；
- scenario；
- product_or_service；
- price；
- trust；
- location；
- nearby；
- store_specific；
- alternative；
- factual。

Scope：

- global；
- country；
- province；
- city；
- district；
- nearby；
- store。

### 7.6 AnalysisJob

一次分析任务，包含多个 Prompt × 模型 × 地域组合。

核心字段：

- projectId；
- jobType；
- triggerType；
- scopeConfig；
- modelConfig；
- promptIds；
- status；
- totalRuns；
- completedRuns；
- failedRuns；
- estimatedCost；
- actualCost；
- startedAt；
- completedAt；
- errorSummary。

状态：

```text
draft
→ queued
→ running
→ partially_completed / completed / failed / cancelled
```

### 7.7 ModelRun

一次具体模型请求。

核心字段：

- analysisJobId；
- promptId；
- provider；
- model；
- requestPayload；
- responseText；
- responseRaw；
- responseStatus；
- latencyMs；
- inputTokens；
- outputTokens；
- cost；
- retryCount；
- errorCode；
- errorMessage；
- startedAt；
- completedAt。

### 7.8 EntityMention

从模型回答中解析出的品牌、门店或竞品提及。

字段：

- modelRunId；
- entityType；
- entityId；
- rawName；
- normalizedName；
- rank；
- sentiment；
- recommendationStrength；
- factualAccuracy；
- contextExcerpt；
- confidenceScore。

### 7.9 VisibilityScore

统一评分，不再拆为完全独立的 Brand GEO、Website GEO 和 Local GEO。

字段：

- projectId；
- analysisJobId；
- overallScore；
- dimensionScores；
- modelScores；
- scopeScores；
- promptCategoryScores；
- confidenceScore；
- scoreVersion；
- calculatedAt。

### 7.10 OptimizationItem

从分析结果生成的优化项。

字段：

- projectId；
- title；
- description；
- category；
- priority；
- impactEstimate；
- effortEstimate；
- evidence；
- relatedPromptIds；
- relatedSourceIds；
- relatedStoreIds；
- status；
- assigneeId；
- dueDate；
- completedAt。

### 7.11 Report

字段：

- projectId；
- analysisJobId；
- title；
- reportType；
- status；
- sectionConfig；
- summary；
- generatedFileUrl；
- publishedAt；
- version。

---

## 8. 创建项目与品牌识别

### 8.1 创建入口

用户点击“创建项目”，只需填写：

- 品牌或商家名称；
- 国家或主要市场；
- 默认语言；
- 可选官网地址；
- 可选行业。

不要求用户选择：品牌、单店或连锁。

### 8.2 自动识别流程

```text
输入品牌名称
→ 标准化名称与别名
→ 搜索候选官网和平台账号
→ 识别是否存在门店
→ 识别地图和本地生活平台
→ 生成候选认知源
→ 计算置信度
→ 用户确认
→ 创建项目
```

识别结果分组展示：

- 品牌基本信息；
- 官方网站；
- 社交与内容平台；
- 地图与本地生活平台；
- 门店；
- 其他候选认知源。

用户可以：

- 确认；
- 修改；
- 删除错误候选；
- 手动新增；
- 标记暂不分析。

### 8.3 识别失败处理

当无法可靠识别时：

- 展示候选列表；
- 要求用户确认官网或至少一个认知源；
- 允许仅凭品牌名称创建草稿项目；
- 后续由后台数据质量队列补充识别。

### 8.4 创建成功后的自动动作

- 保存品牌实体；
- 建立认知源；
- 导入或创建门店；
- 根据行业和认知源生成 Prompt；
- 推荐首批模型；
- 估算分析成本；
- 引导用户发起首次检测。

---

## 9. 项目概览

项目概览应回答：

- 当前 AI 可见度得分是多少；
- 相比上次变化多少；
- 哪些模型表现最好或最差；
- 哪些 Prompt 风险最大；
- 主要竞品是谁；
- 哪些认知源存在问题；
- 哪些门店或城市需要关注；
- 下一步应做什么。

页面模块：

1. 总分与趋势；
2. 模型表现；
3. Prompt 分类表现；
4. 地域表现；
5. 竞品对比；
6. 重点问题；
7. 优化任务；
8. 最近分析；
9. 品牌管家快捷提问。

---

## 10. 品牌与认知源管理

### 10.1 品牌信息

支持维护：

- 标准品牌名；
- 别名；
- Logo；
- 行业；
- 品牌描述；
- 核心产品或服务；
- 服务市场；
- 官方联系信息。

修改品牌核心字段时：

- 保留历史版本；
- 标记需要重新生成 Prompt；
- 提醒是否重新识别认知源；
- 不自动覆盖历史报告。

### 10.2 认知源列表

展示：

- 来源类型；
- 名称；
- URL；
- 关联品牌或门店；
- 状态；
- 最近抓取；
- 最近变化；
- 可信度；
- 是否参与分析。

支持：

- 手动新增；
- 验证；
- 停用；
- 重新抓取；
- 关联门店；
- 查看快照；
- 查看差异。

### 10.3 内容快照

每次抓取保存：

- 抓取时间；
- 页面标题；
- 主要正文；
- 结构化字段；
- 内容摘要；
- 哈希；
- 与上次差异；
- 抓取状态。

首期只要求支持公开网页和可稳定访问来源；平台 App 内部数据属于后续版本。

---

## 11. 门店与本地分析

### 11.1 门店导入方式

- 系统自动识别；
- CSV 批量导入；
- 手动新增；
- API 同步（企业版后续支持）。

### 11.2 CSV 必填字段

- 门店名称；
- 城市；
- 详细地址。

推荐字段：

- 门店编码；
- 省份；
- 区县；
- 经度；
- 纬度；
- 电话；
- 营业时间；
- 服务项目；
- 状态；
- 是否重点门店。

### 11.3 重复识别

系统根据以下信息计算重复概率：

- 品牌；
- 标准化门店名；
- 地址；
- 经纬度；
- 电话；
- 外部平台 ID。

高置信度重复自动合并候选，正式合并必须由用户或管理员确认。

### 11.4 大型连锁成本控制

当门店超过套餐限制时，系统默认建议：

- 选择重点城市；
- 选择重点门店；
- 按区域抽样；
- 按门店等级抽样；
- 仅测试附近与城市类 Prompt。

### 11.5 本地分析输出

- 城市可见度；
- 区域可见度；
- 附近推荐表现；
- 门店提及率；
- 门店排名；
- 门店事实准确性；
- 竞品门店出现频率；
- 地图和平台资料一致性。

---

## 12. Prompt 系统

### 12.1 自动生成

系统根据：

- 行业；
- 品牌信息；
- 核心产品与服务；
- 国家与城市；
- 是否有门店；
- 竞品；
- 用户选择的目标；
- 认知源内容；

生成初始 Prompt。

### 12.2 Prompt 管理

支持：

- 新增；
- 编辑；
- 删除；
- 启停；
- 批量导入；
- 分组；
- 调整优先级；
- 生成变体；
- 查看历史版本；
- 查看对应分析结果。

### 12.3 Prompt 质量要求

生成的 Prompt 应：

- 接近真实用户提问；
- 不强行包含品牌名；
- 避免诱导模型；
- 表达自然；
- 明确地域时使用真实城市或地标；
- 同一组中避免语义重复；
- 可对应到明确分析目标。

### 12.4 Prompt 模板

管理后台可以按行业配置模板：

- 模板名称；
- 行业；
- 语言；
- 分类；
- Scope；
- 参数变量；
- 默认优先级；
- 是否启用。

示例：

```text
{{city}}有哪些值得推荐的{{service_category}}？
{{landmark}}附近有哪些{{service_category}}？
{{brand}}和{{competitor}}相比怎么样？
```

---

## 13. 模型配置与分析执行

### 13.1 支持的模型结构

模型不写死在产品逻辑中，通过 Provider 和 Model 配置：

- provider；
- modelCode；
- displayName；
- API Endpoint；
- 请求协议；
- 支持语言；
- 上下文长度；
- 价格；
- 并发限制；
- 超时；
- 重试策略；
- 状态；
- 是否为备用模型。

### 13.2 发起分析

用户选择：

- Prompt 集；
- 模型；
- 地域范围；
- 门店范围；
- 语言；
- 是否生成报告；
- 是否完成后通知。

系统展示：

- 预计运行次数；
- 预计耗时；
- 预计额度或成本；
- 影响范围。

### 13.3 任务拆分

```text
AnalysisJob
→ Prompt × Model × Scope
→ ModelRun
→ Parse Task
→ Score Task
→ Report Task
```

### 13.4 重试策略

可重试错误：

- 429；
- 5xx；
- 网络超时；
- 临时解析失败；
- 供应商限流。

不可自动无限重试：

- 认证失败；
- 余额不足；
- 参数错误；
- 模型不存在；
- 内容策略拒绝。

默认最多重试 3 次，使用指数退避，并记录实际成本。

### 13.5 取消任务

- queued 状态可直接取消；
- running 状态停止派发新 ModelRun；
- 已完成请求不回滚成本；
- 保留已完成结果；
- 状态标记为 cancelled 或 partially_completed。

---

## 14. 回答解析与竞品识别

### 14.1 解析内容

从每次回答中提取：

- 是否提及目标品牌；
- 是否主动推荐；
- 排名或出现顺序；
- 推荐理由；
- 负面描述；
- 事实是否准确；
- 是否提及目标门店；
- 竞品名称；
- 竞品推荐顺序；
- 回答置信度。

### 14.2 实体归一化

同一实体可能以别名、英文名、简称或门店名出现。系统应结合：

- Brand aliases；
- Store aliases；
- 字符串相似度；
- 上下文；
- 行业；
- 地域；

归一到统一实体。

低置信度结果进入人工审核队列。

### 14.3 竞品池

竞品来源：

- 用户手动配置；
- 模型回答自动识别；
- 行业模板；
- 历史高频提及。

竞品需要支持：

- 确认；
- 排除；
- 合并别名；
- 标记直接竞品或间接竞品；
- 查看趋势。

---

## 15. 评分体系

### 15.1 总体原则

所有项目统一使用 AI Visibility Score，满分 100。评分结构根据项目拥有的认知源、门店和 Prompt 动态组成，但总分可跨项目理解。

### 15.2 建议维度

基础维度：

1. 提及率 Mention Rate；
2. 推荐率 Recommendation Rate；
3. 推荐顺位 Ranking Strength；
4. 事实准确性 Factual Accuracy；
5. 模型覆盖 Model Coverage；
6. Prompt 覆盖 Prompt Coverage；
7. 一致性 Consistency；
8. 竞品竞争力 Competitive Position。

动态维度：

- 官网认知；
- 门店覆盖；
- 本地推荐；
- 认知源一致性；
- 城市覆盖。

### 15.3 初始权重建议

```text
提及率：20%
推荐率：20%
推荐顺位：15%
事实准确性：15%
模型覆盖：10%
Prompt 覆盖：10%
一致性：5%
竞品竞争力：5%
```

如果项目存在门店，可从 Prompt 覆盖和模型覆盖中划分一部分给门店覆盖和本地推荐。具体权重必须版本化。

### 15.4 置信度

每个分数同时输出 confidenceScore，取决于：

- Prompt 数量；
- 模型数量；
- 成功运行比例；
- 地域覆盖；
- 解析置信度；
- 是否存在大量失败。

低置信度报告必须提示“结果仅供参考，建议增加样本后复测”。

### 15.5 分数版本

保存 scoreVersion，后续调整算法时：

- 历史报告保留原分数；
- 可选择使用新算法重算；
- 趋势图默认只比较同版本分数；
- 跨版本需明确标记。

---

## 16. 报告系统

### 16.1 报告类型

- 首次诊断报告；
- 定期监测报告；
- 竞品对比报告；
- 门店与城市报告；
- 优化复测报告；
- 管理层简报。

### 16.2 动态章节

通用章节：

1. 执行摘要；
2. AI Visibility Score；
3. 模型表现；
4. Prompt 表现；
5. 竞品对比；
6. 核心问题；
7. 优化建议；
8. 方法与样本说明。

可选章节：

- 官网认知；
- 认知源；
- 门店；
- 城市；
- 附近场景；
- 平台一致性。

### 16.3 报告操作

- 在线查看；
- 导出 PDF；
- 分享链接；
- 设置访问密码；
- 复制报告；
- 生成管理层摘要；
- 让品牌管家解读；
- 基于报告创建优化任务。

### 16.4 报告状态

```text
generating
→ ready
→ published
→ archived

异常：failed
```

---

## 17. 优化建议与执行任务

### 17.1 优化建议分类

- 品牌基础信息；
- 官网内容；
- FAQ 与结构化内容；
- 认知源一致性；
- 门店资料；
- 本地场景；
- 内容覆盖；
- Prompt 覆盖；
- 竞品差距；
- 数据质量。

### 17.2 优先级

优先级根据：

- 影响分数；
- 涉及 Prompt 数量；
- 涉及模型数量；
- 竞品差距；
- 实施成本；
- 数据置信度。

输出：P0、P1、P2、P3。

### 17.3 任务状态

```text
todo
→ in_progress
→ waiting_review
→ completed
→ scheduled_retest
→ verified

可选：cancelled
```

### 17.4 复测闭环

任务完成后：

- 用户选择相关 Prompt；
- 系统推荐复测模型；
- 发起复测；
- 对比优化前后；
- 标记改善、无变化或下降；
- 关联到原优化任务。

---

## 18. 用户侧 Agent：映川品牌管家

### 18.1 定位

品牌管家帮助用户理解报告、制定优化计划、创建任务和跟进复测。

### 18.2 使用入口

- 项目概览；
- 报告页；
- Prompt 页；
- 门店页；
- 优化任务页；
- 独立对话页。

### 18.3 支持问题

- 为什么分数下降；
- 哪些 Prompt 最值得优化；
- 哪个模型最不容易推荐我；
- 竞品为什么领先；
- 哪些门店信息可能有问题；
- 下一步应该做什么；
- 帮我生成优化任务；
- 帮我安排复测。

### 18.4 Skill

- get_project；
- get_visibility_report；
- compare_reports；
- inspect_knowledge_sources；
- get_store_issues；
- generate_optimization_plan；
- create_optimization_item；
- generate_content_draft；
- create_retest_job。

### 18.5 权限

品牌管家只能访问当前用户有权限的工作区和项目，不能访问平台级数据。

---

## 19. 管理侧 Agent：映川运营助手

### 19.1 定位

映川运营助手是管理后台的智能运营中枢，同时承担：

- 运维分析；
- 数据分析；
- 产品分析；
- 用户运营；
- 数据质量；
- 智能客服辅助；
- 定时报告；
- 异常推送；
- 低风险操作执行。

### 19.2 管理首页智能摘要

展示：

- 今日核心指标；
- 需要立即处理；
- 值得关注；
- 今日建议；
- 最近恢复的异常；
- Agent 最近执行。

### 19.3 运维分析

检查：

- API；
- Worker；
- Redis；
- PostgreSQL；
- 队列；
- 模型；
- 任务成功率；
- 报告生成；
- 成本；
- 响应时间。

### 19.4 业务分析

支持分析：

- 新增用户；
- 活跃；
- 项目；
- 付费转化；
- 留存；
- 复测率；
- 套餐；
- 行业；
- 城市；
- 功能使用；
- 模型成本与毛利。

### 19.5 产品分析

自动发现：

- 漏斗流失；
- 长时间停留步骤；
- 低使用模块；
- 高频手动操作；
- 高频客服问题；
- 新行业模板机会；
- 用户需求变化。

### 19.6 智能客服

根据用户、任务、额度、订单、报告和异常记录生成客服回复草稿。第一阶段不自动发送给用户。

### 19.7 数据质量

识别：

- 重复品牌；
- 重复门店；
- 错误关联；
- 无效认知源；
- POI 匹配失败；
- 低置信度实体；
- 过期门店状态；
- 解析异常。

---

## 20. 智能监控、定时任务与 Telegram 推送

### 20.1 设计原则

异常触发由确定性的规则引擎负责，Agent 只负责补充分析、影响评估和建议。

```text
指标采集
→ 规则判断
→ AlertEvent
→ Agent 分析
→ Notification
→ Telegram / 站内消息
```

### 20.2 定时报告

支持：

- 每日运营日报；
- 每周运营周报；
- 每月经营月报；
- 每日系统健康摘要；
- 每周数据质量报告；
- 项目定期复测报告。

每日运营日报默认字段：

- 新增用户；
- 新增项目；
- 分析任务；
- 成功率；
- 付费用户；
- 收入；
- 模型成本；
- 异常任务；
- 重点变化；
- 今日建议。

### 20.3 异常类型

系统异常：

- API 不可用；
- Worker 离线；
- 队列积压；
- 数据库异常；
- Redis 异常；
- 报告生成超时。

模型异常：

- 失败率高；
- 延迟高；
- 429；
- 返回结构异常；
- 成本异常。

业务异常：

- 新增下降；
- 转化下降；
- 退款上升；
- 套餐使用异常；
- 行业流量异常。

用户异常：

- 高价值用户连续失败；
- 支付后未生成报告；
- 额度扣除异常；
- 连续多次失败。

数据质量异常：

- 品牌识别错误率上升；
- 门店重复率上升；
- POI 匹配失败；
- 无效认知源增加；
- 解析失败率上升。

### 20.4 告警等级

- P0：系统不可用、大面积业务中断，立即推送且不受静默限制；
- P1：模型、队列、成本或重要客户异常，立即推送；
- P2：业务指标明显变化，可即时或日报汇总；
- P3：趋势和建议，进入日报或周报。

### 20.5 默认规则

- 模型失败率 ≥ 10%，持续 5 分钟，P1；
- 队列等待任务 ≥ 500，持续 10 分钟，P1；
- 单小时模型成本高于过去 7 天同期均值 50%，P1；
- 报告平均生成时间 ≥ 5 分钟，持续 15 分钟，P1；
- 高价值用户连续失败 ≥ 3 次，P1；
- 当日新增用户低于过去 7 日均值 30%，P2。

### 20.6 去重和恢复

- 首次异常立即推送；
- 同一异常默认 30 分钟最多更新一次；
- 多个相似异常合并；
- 恢复后发送恢复通知；
- 每个 AlertEvent 有 open、acknowledged、resolved、ignored 状态。

### 20.7 Telegram 配置

管理后台支持：

- Bot Token；
- Chat ID；
- 推送语言；
- 接收告警等级；
- 静默时间；
- 测试消息；
- 启停。

安全要求：

- Token 加密存储；
- 前端不返回完整 Token；
- 日志脱敏；
- 消息不得包含完整密钥、支付信息或用户隐私；
- Telegram 不可用时不影响主业务。

### 20.8 推送消息结构

- 标题；
- 等级；
- 时间；
- 当前值；
- 正常基线；
- 可能原因；
- 影响范围；
- Agent 建议；
- 详情链接。

### 20.9 失败重试

- 第一次失败后 1 分钟重试；
- 第二次失败后 5 分钟重试；
- 第三次失败后 15 分钟重试；
- 连续失败标记渠道异常；
- P0 推送失败同时写入站内最高级别告警。

---

## 21. Agent 权限与风险控制

### 21.1 低风险，可直接执行

- 查询数据；
- 生成分析；
- 创建待办；
- 创建告警；
- 发送已配置的定时摘要；
- 重试单个任务；
- 生成客服草稿；
- 生成优化任务草稿。

### 21.2 中风险，必须确认

- 批量重试；
- 暂停模型；
- 切换备用模型；
- 修改并发；
- 批量发送用户通知；
- 增加用户额度；
- 修改 Prompt 模板；
- 修改门店；
- 合并品牌或门店。

### 21.3 高风险，禁止 Agent 执行

- 删除用户；
- 删除订单；
- 修改支付金额或状态；
- 退款；
- 查看或输出完整密钥；
- 直接执行数据库命令；
- 批量删除项目；
- 修改管理员权限；
- 关闭审计日志。

### 21.4 审计要求

记录：

- 触发者；
- Agent；
- Skill；
- 输入；
- 输出；
- 风险等级；
- 审批人；
- 执行结果；
- 模型；
- Token；
- 成本；
- 时间。

---

## 22. 工作区、团队与权限

### 22.1 Workspace

一个账号可以加入多个工作区。所有项目归属于工作区。

### 22.2 角色

用户端：

- owner；
- admin；
- analyst；
- operator；
- viewer。

管理端：

- super_admin；
- platform_operator；
- support；
- finance_viewer；
- data_reviewer；
- ops_engineer。

### 22.3 权限原则

- 最小权限；
- 项目级隔离；
- 管理员操作审计；
- 敏感字段脱敏；
- Agent 权限不高于触发者权限；
- 定时 Agent 使用专用服务账号和固定 Skill 白名单。

---

## 23. 套餐、额度与计费

### 23.1 计费维度

可组合：

- 项目数；
- Prompt 数；
- 模型运行次数；
- 门店数；
- 定期复测频率；
- 报告导出；
- 团队成员数；
- Agent 调用额度；
- 推送渠道。

### 23.2 用量记录

记录：

- workspaceId；
- userId；
- projectId；
- resourceType；
- quantity；
- unitCost；
- source；
- relatedJobId；
- createdAt。

### 23.3 扣费原则

- 发起任务前校验额度；
- 实际扣除以成功发出的模型请求为准；
- 平台内部失败且未调用供应商不扣模型额度；
- 供应商已计费但解析失败，记录实际成本并按补偿策略处理；
- 重试是否扣费需在用户侧明确说明。

---

## 24. 通知中心

通知类型：

- 分析完成；
- 分析失败；
- 报告完成；
- 额度不足；
- 复测提醒；
- 品牌异常；
- 门店异常；
- 团队邀请；
- 系统公告；
- Agent 任务结果。

支持：

- 全部已读；
- 单条已读；
- 跳转业务对象；
- 通知偏好；
- 站内、邮件和 Telegram 渠道配置。

---

## 25. 管理后台详细功能

### 25.1 用户与工作区

- 搜索用户；
- 查看状态；
- 查看工作区；
- 查看套餐与用量；
- 查看项目；
- 查看异常；
- 调整状态；
- 人工增加额度（需权限和审计）；
- 禁用账号。

### 25.2 项目管理

- 查看项目状态；
- 品牌识别结果；
- 认知源；
- 门店；
- Prompt；
- 分析任务；
- 报告；
- 成本；
- 数据质量问题。

### 25.3 模型管理

- Provider；
- 模型；
- 密钥；
- 单价；
- 并发；
- 超时；
- 重试；
- 健康状态；
- 备用模型；
- 成本统计；
- 调用日志。

### 25.4 任务管理

- 筛选状态；
- 查看子任务；
- 查看错误；
- 重试；
- 取消；
- 导出；
- 查看影响用户；
- Agent 分析失败原因。

### 25.5 数据质量工作台

- 低置信度品牌；
- 重复品牌；
- 重复门店；
- 错误认知源；
- POI 匹配失败；
- 实体解析审核；
- 处理记录。

### 25.6 客服工作台

- 用户搜索；
- 最近任务；
- 报告；
- 额度；
- 订单；
- 异常；
- Agent 回复建议；
- 内部备注；
- 工单状态。

---

## 26. 核心状态机

### 26.1 项目

```text
draft
→ identifying
→ waiting_confirmation
→ ready
→ active
→ archived
```

### 26.2 分析任务

```text
draft
→ queued
→ running
→ completed

异常分支：
partially_completed / failed / cancelled
```

### 26.3 AgentRun

```text
queued
→ running
→ waiting_confirmation
→ completed

异常分支：
partially_completed / failed / cancelled
```

### 26.4 优化任务

```text
todo
→ in_progress
→ waiting_review
→ completed
→ scheduled_retest
→ verified
```

### 26.5 告警

```text
open
→ acknowledged
→ resolved

可选：ignored
```

---

## 27. API 设计建议

### 27.1 用户端 API

```text
POST   /projects
GET    /projects
GET    /projects/:id
PATCH  /projects/:id
POST   /projects/:id/identify
POST   /projects/:id/confirm-identification

GET    /projects/:id/knowledge-sources
POST   /projects/:id/knowledge-sources
PATCH  /knowledge-sources/:id
POST   /knowledge-sources/:id/refetch

GET    /projects/:id/stores
POST   /projects/:id/stores
POST   /projects/:id/stores/import
PATCH  /stores/:id

GET    /projects/:id/prompts
POST   /projects/:id/prompts/generate
POST   /projects/:id/prompts
PATCH  /prompts/:id

POST   /projects/:id/analysis-jobs
GET    /analysis-jobs/:id
POST   /analysis-jobs/:id/cancel
POST   /analysis-jobs/:id/retry

GET    /projects/:id/scores
GET    /projects/:id/reports
GET    /reports/:id
POST   /reports/:id/export

GET    /projects/:id/optimization-items
POST   /optimization-items
PATCH  /optimization-items/:id
POST   /optimization-items/:id/retest

POST   /agent/brand-assistant/messages
GET    /agent/conversations/:id
```

### 27.2 管理端 API

```text
GET    /admin/dashboard
GET    /admin/users
GET    /admin/projects
GET    /admin/tasks
GET    /admin/models
PATCH  /admin/models/:id
POST   /admin/models/:id/pause
POST   /admin/models/:id/enable

GET    /admin/data-quality/issues
POST   /admin/data-quality/issues/:id/resolve

GET    /admin/alerts
POST   /admin/alert-rules
PATCH  /admin/alert-rules/:id
POST   /admin/alerts/:id/acknowledge
POST   /admin/alerts/:id/resolve

GET    /admin/notification-channels
POST   /admin/notification-channels/telegram
POST   /admin/notification-channels/:id/test

POST   /admin/agent/messages
GET    /admin/agent/runs
POST   /admin/agent/actions/:id/approve
POST   /admin/agent/actions/:id/reject
```

### 27.3 内部 Skill API

```text
get_dashboard_metrics
get_task_health
get_model_health
get_queue_health
get_user_metrics
get_conversion_funnel
get_revenue_metrics
get_data_quality_metrics
get_project_report
compare_reports
retry_task
retry_tasks_batch
pause_model
enable_fallback_model
create_admin_alert
create_admin_task
send_notification
send_telegram_message
generate_daily_digest
```

每个 Skill 必须定义：权限、风险等级、幂等键、最大影响范围、超时和审计字段。

---

## 28. 技术架构建议

### 28.1 技术栈

- 前端：Next.js + TypeScript；
- 管理后台：Next.js 独立应用或 Monorepo 子应用；
- 后端：NestJS；
- ORM：Prisma；
- 数据库：PostgreSQL；
- 缓存与队列：Redis + BullMQ；
- 文件：对象存储；
- 前端部署：Cloudflare；
- 后端与 Worker：云服务器或容器平台；
- Agent：OpenClaw；
- 日志与监控：结构化日志 + 指标系统；
- 推送：Telegram Bot API。

### 28.2 服务划分

```text
Web App
Admin App
API Service
Auth Service
Project Service
Knowledge Source Service
Store Service
Prompt Service
Analysis Orchestrator
Model Gateway
Parsing Service
Scoring Service
Report Service
Optimization Service
Agent Gateway
Notification Service
Scheduler
Worker Cluster
```

首期可以模块化单体实现，但代码边界按上述领域拆分。

### 28.3 Agent 架构

```text
User/Admin
→ Agent Gateway
→ OpenClaw Runtime
→ Skill Registry
→ Internal APIs
→ Business Services
```

Agent 不直接连接生产数据库，不直接读取密钥，不绕过权限层。

### 28.4 队列

建议队列：

- brand-identification；
- source-discovery；
- source-fetch；
- prompt-generation；
- model-run；
- response-parse；
- score-calculate；
- report-generate；
- notification-send；
- agent-run；
- scheduled-task；
- data-quality-check。

---

## 29. 非功能性需求

### 29.1 性能

- 普通列表接口 P95 < 800ms；
- 关键详情接口 P95 < 1.5s；
- 长任务全部异步；
- 任务状态支持轮询或 WebSocket/SSE；
- 管理首页核心数据应有缓存。

### 29.2 可用性

- Telegram 故障不得影响分析任务；
- 单模型故障不应阻塞其他模型；
- Worker 支持水平扩容；
- 任务具备幂等性；
- 关键任务支持失败重放。

### 29.3 安全

- 密钥加密；
- RBAC；
- 工作区数据隔离；
- 管理后台二次验证；
- 敏感日志脱敏；
- Agent 提示词注入防护；
- 外部网页内容视为不可信；
- 所有写操作审计。

### 29.4 可观测性

记录：

- 请求量；
- 错误率；
- 延迟；
- 队列长度；
- Worker 状态；
- 模型成功率；
- 单次成本；
- 报告耗时；
- Agent Token 与成本；
- Telegram 发送成功率。

---

## 30. 埋点与核心指标

### 30.1 激活漏斗

```text
注册
→ 创建项目
→ 确认识别结果
→ 确认 Prompt
→ 发起首次分析
→ 查看报告
→ 创建优化任务
→ 发起复测
```

### 30.2 业务指标

- 新增用户；
- 激活率；
- 首次分析完成率；
- 报告查看率；
- 付费转化率；
- 复测率；
- 月留存；
- 每项目 Prompt 数；
- 每项目模型数；
- 单任务成本；
- 毛利率；
- Agent 使用率；
- Agent 建议采纳率；
- Telegram 推送点击率。

### 30.3 质量指标

- 品牌识别确认率；
- 认知源误识别率；
- 门店重复率；
- 模型运行成功率；
- 实体解析准确率；
- 报告生成成功率；
- 告警误报率；
- Agent 操作失败率。

---

## 31. 异常与边界场景

必须处理：

- 同名品牌；
- 品牌更名；
- 一个官网对应多个品牌；
- 门店搬迁；
- 门店关闭；
- 认知源无法访问；
- 模型拒答；
- 模型回答为空；
- 模型返回非结构化内容；
- 竞品与目标品牌同名；
- 任务部分成功；
- 用户额度不足；
- Telegram Token 失效；
- Chat ID 错误；
- 定时任务重复执行；
- Agent 生成无效操作参数；
- 管理员在执行前撤销确认；
- 评分算法升级。

---

## 32. MVP 范围

### 32.1 P0 必须完成

- 注册登录与工作区；
- 创建项目；
- 品牌识别与人工确认；
- 认知源管理；
- Prompt 自动生成和编辑；
- 多模型分析任务；
- 回答存储与实体解析；
- AI Visibility Score；
- 在线报告；
- 基础优化建议；
- 管理后台用户、项目、任务和模型管理；
- Agent Gateway 与 Skill Registry；
- 管理端数据问答；
- AgentRun、AgentAction 和审计；
- Telegram 渠道配置与测试消息。

### 32.2 P1

- 门店 CSV；
- 城市与门店分析；
- 每日运营日报；
- 模型失败率、成本、队列告警；
- Telegram 实时推送；
- 告警去重和恢复；
- 单任务重试；
- 品牌管家报告问答。

### 32.3 P2

- 数据质量工作台；
- 智能客服草稿；
- 用户漏斗与产品分析；
- 优化任务与复测闭环；
- 企业自定义 Prompt 模板；
- 多渠道推送；
- 中风险操作审批。

### 32.4 P3

- 自动模型切换；
- 高级多 Agent 协作；
- App 内认知源采样；
- 企业 API；
- 门店自动同步；
- 全球多语言 GEO。

---

## 33. 验收标准

### 33.1 创建项目

- 用户不需要选择品牌类型；
- 输入品牌后可返回候选官网、认知源和门店；
- 用户可以确认和修改；
- 创建后动态生成适用模块；
- 识别失败仍可创建草稿项目。

### 33.2 Prompt

- 系统能根据行业和地域生成自然问题；
- 支持增删改和启停；
- 支持 Scope；
- 不同版本可追踪；
- 发起分析前能估算运行次数。

### 33.3 分析任务

- 任务正确拆分为 ModelRun；
- 状态可追踪；
- 支持部分成功；
- 错误可重试；
- 成本可统计；
- 取消不影响已完成结果。

### 33.4 评分与报告

- 统一总分；
- 展示维度、模型、Prompt 和地域分数；
- 展示置信度；
- 报告章节动态生成；
- 历史报告不被新算法直接覆盖。

### 33.5 Agent

- Agent 只通过 Skill 访问业务能力；
- 权限不超过触发者；
- 中风险操作必须确认；
- 高风险 Skill 不存在；
- 所有运行和操作有审计；
- Agent 不得编造内部指标。

### 33.6 Telegram

- 可配置 Bot Token 与 Chat ID；
- 可发送测试消息；
- Token 加密且页面不回显；
- 定时日报可正常发送；
- P0/P1 异常可即时发送；
- 相同异常不重复轰炸；
- 恢复后发送恢复通知；
- 推送失败有重试和日志。

---

## 34. Codex 开发约束

Codex 在实现本 PRD 时必须遵循：

1. 先输出技术设计与目录结构，再进入编码；
2. 所有核心实体使用明确类型，不使用无约束 JSON 代替领域字段；
3. 所有异步任务必须具备幂等键；
4. 所有状态变更通过服务层完成，不允许页面直接修改数据库；
5. Agent 不得直连数据库；
6. Agent Skill 必须声明权限与风险等级；
7. 所有管理端写操作写入审计日志；
8. 所有模型调用记录 Provider、Model、Token、成本和错误；
9. 所有外部密钥使用环境变量或密钥服务；
10. Telegram Token 绝不写入前端、仓库或普通日志；
11. 评分算法独立模块并带 scoreVersion；
12. 业务服务与第三方模型协议通过 Model Gateway 解耦；
13. 数据库迁移使用 Prisma Migration；
14. 每个模块包含单元测试，核心流程包含集成测试；
15. 首期优先实现模块化单体，不提前拆微服务；
16. 前后端接口使用统一错误码和可读错误信息；
17. 所有批量操作设置最大范围；
18. 所有时间统一以 UTC 存储，展示时转换项目或用户时区；
19. 所有金额使用最小货币单位或 Decimal，禁止浮点数；
20. 生成代码前应将本 PRD拆成 Epic、Story 和 Task。

---

## 35. 建议代码仓库结构

```text
apps/
  web/
  admin/
  api/
  worker/

packages/
  database/
  auth/
  shared-types/
  ui/
  model-gateway/
  agent-sdk/
  scoring/
  notifications/
  observability/

services-or-modules/
  projects/
  brands/
  stores/
  knowledge-sources/
  prompts/
  analysis/
  parsing/
  scoring/
  reports/
  optimization/
  billing/
  admin/
  alerts/
  agents/
  notifications/
```

---

## 36. 建议开发顺序

1. 初始化 Monorepo、数据库、认证和工作区；
2. Project、BrandEntity、KnowledgeSource 基础模型；
3. 创建项目与识别确认流程；
4. Prompt 生成与管理；
5. Model Gateway 与模型配置；
6. AnalysisJob、ModelRun 和队列；
7. 回答解析、实体归一化和竞品识别；
8. 评分模块；
9. 报告；
10. 管理后台；
11. Agent Gateway、Skill Registry、审计；
12. Telegram 通知；
13. 告警规则与定时日报；
14. 门店和本地分析；
15. 优化任务与复测闭环；
16. 数据质量和智能客服。

---

## 37. 最终产品愿景

映川最终不是一个只提供检测结果的工具，而是品牌在 AI 时代的认知管理系统。

```text
识别品牌认知资产
→ 检测 AI 如何回答
→ 找出错误、缺失与竞争差距
→ 生成可执行优化方案
→ 推动执行与复测
→ 持续监控系统和业务
→ 主动推送关键变化
```

用户侧，映川是品牌的 AI 认知管家。

管理侧，映川是同时承担运维、数据分析、产品分析、用户运营、数据质量与客服辅助的智能运营中心。

最终体验从：

> 用户和管理员进入后台寻找数据与问题

升级为：

> 系统主动发现问题、解释原因、推送信息并推动处理。
