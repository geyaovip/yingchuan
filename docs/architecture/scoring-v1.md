# AI Visibility Score v1

## 1. 适用范围

`score-v1` 用于 P0 的品牌级分析，只包含 PRD 规定的八个基础维度。门店、城市、本地推荐和认知源一致性进入后续 scoreVersion，不能静默改变 v1。

每个评分必须保存：`scoreVersion`、`parserVersion`、`judgeVersion`（如使用确定性之外的裁决器）、输入 AnalysisJob、模型/Prompt/Scope/联网快照、成功与失败样本数、维度原始值、实际权重、置信度和计算时间。

## 2. 有效样本

- Provider 请求成功且解析任务完成的 ModelRun 是可见度有效样本。
- 模型明确拒答或返回“无法回答”属于有效回答，提及/推荐记 0；不能当系统失败剔除。
- 网络、认证、限流、超时和解析永久失败不进入品牌表现分母，但降低覆盖维度与置信度。
- 重试成功只保留一个逻辑样本；不能因多次 attempt 重复计分。

## 3. 八个基础维度

所有维度输出 0–100。

| 维度                 | 权重 | v1 计算                                                         |
| -------------------- | ---: | --------------------------------------------------------------- |
| Mention Rate         |  20% | 提及目标品牌的有效样本数 / 有效样本数                           |
| Recommendation Rate  |  20% | 主动推荐目标品牌的有效样本数 / 有效样本数                       |
| Ranking Strength     |  15% | 每个有效样本的目标品牌顺位分平均值                              |
| Factual Accuracy     |  15% | 已抽取目标品牌事实的准确度加权平均；没有可核对事实则 N/A        |
| Model Coverage       |  10% | 至少产生一个有效样本的合格模型数 / 通过原生能力筛选的合格模型数 |
| Prompt Coverage      |  10% | 至少在一个合格模型产生有效样本的 Prompt 数 / 选定 Prompt 数     |
| Consistency          |   5% | 不同模型之间提及率与推荐率的一致程度                            |
| Competitive Position |   5% | 目标品牌相对最高竞品的加权推荐份额                              |

百分比在最终展示时四舍五入，内部至少保留 4 位小数。

### 3.1 顺位分

```text
第 1 位 = 100
第 2 位 = 75
第 3 位 = 50
第 4 位 = 25
第 5 位及以后或未出现 = 0
```

如果回答没有明确列表，但目标品牌被主动推荐，顺位使用中性分 50 并标记 `rankInferred=true`；不能把无顺位回答当作第 1 名。

### 3.2 事实准确度

每条可核对事实标记 `correct=100`、`partially_correct=50`、`incorrect=0`，乘以解析置信度后求加权平均。事实基准只能来自分析时冻结的已确认 BrandEntity/KnowledgeSource 快照：完全一致为 correct，不完整但不矛盾为 partially_correct，与已确认事实矛盾为 incorrect。来源互相冲突或过期时产生 review issue，该事实不计分。

### 3.3 一致性

对每个模型计算 Mention Rate 和 Recommendation Rate，然后计算模型间两项指标的平均绝对差：

```text
rawConsistency = 100 - (mean(pairwise mention-rate diff) + mean(pairwise recommendation-rate diff)) / 2
visibilityGate = max(overall mention rate, overall recommendation rate) / 100
Consistency = rawConsistency × visibilityGate
```

结果限制在 0–100。因此“所有模型都稳定不提及”不会因一致性获得高分。只有一个有效模型时该维度为 N/A。

### 3.4 竞品竞争力

使用顺位分累计每个品牌的推荐积分：

```text
Competitive Position = targetPoints / max(targetPoints, topCompetitorPoints) × 100
```

无目标品牌积分时为 0；有目标积分且没有竞品积分时为 100。

## 4. 缺失维度

N/A 维度不记 0，其权重按原权重比例重新分配给其他可计算维度。报告必须展示原权重、实际权重及缺失原因。覆盖维度不能因“没有样本”变为 N/A。N/A 原权重合计超过 15% 时不发布正式趋势点，只显示诊断分。

## 5. 总分

```text
Overall Score = Σ(dimensionScore × effectiveWeight)
```

结果限制在 0–100，数据库保存 Decimal，UI 展示一位小数。不得在前端重新计算。

## 6. 置信度

```text
sample adequacy   40%  # min(有效样本 / 40, 1)
run success ratio 30%  # 有效逻辑样本 / 计划 ModelRun
parse confidence  30%  # EntityMention 平均解析置信度
```

置信度同样为 0–100：`high ≥ 75`、`medium 50–74.9`、`low < 50`。

发布为正式趋势点至少需要 20 个有效样本、5 个 Prompt 和 2 个有效模型；未达到时仍可显示诊断结果，但置信度最高封顶 49，并明确提示增加样本。

## 7. 趋势可比性

默认只比较相同 `scoreVersion`、模型集合、Prompt 版本集合、Scope 和联网策略的结果。条件变化时允许并排查看，但趋势图必须标记“测试配置发生变化”，不能直接解释为品牌改善或下降。

## 8. 上线校准

E7 必须建立包含提及、未提及、拒答、别名、多竞品、事实正确/错误、不同顺位和失败样本的 golden dataset。初始门槛：提及/推荐/品牌归一的 macro F1 ≥ 0.90，明确顺位的 exact match ≥ 0.85，事实标签 macro F1 ≥ 0.80，评分纯函数对同一输入必须 100% 确定性。事实标注由两人独立完成，分歧复核。改变计算语义必须新增 `score-v2`，不能覆盖历史分数。
