export const productUrl = "https://app.chatway.chat";

export const capabilities = [
  {
    index: "01",
    title: "建立品牌认知基线",
    description:
      "整合品牌名称、官网与关键认知源，先确认事实，再开始检测，避免把低置信度推断当成结论。",
  },
  {
    index: "02",
    title: "运行多模型检测",
    description:
      "围绕真实用户问题，统一编排多个大模型，记录模型版本、耗时、成本与失败原因。",
  },
  {
    index: "03",
    title: "生成证据化报告",
    description:
      "从回答中识别品牌、竞品与推荐顺位，以样本、评分版本和置信度解释每一个结果。",
  },
  {
    index: "04",
    title: "获得可执行建议",
    description:
      "把分散的回答转成有优先级、有依据的优化方向，让团队知道下一步先改什么。",
  },
] as const;

export const workflow = [
  ["输入品牌", "填写品牌名称与已知官网，确认系统识别结果。"],
  ["确认问题", "检查系统生成的真实用户问题与地域范围。"],
  ["启动分析", "选择可用模型，确认预计运行量与成本。"],
  ["查看报告", "阅读评分、证据、限制说明和优化建议。"],
] as const;
