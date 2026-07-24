export const productUrl = "https://app.chatway.chat";

export const capabilities = [
  {
    index: "01",
    title: "多模型检测",
    description:
      "围绕真实用户问题，同步检测多个主流大模型如何提及、描述和推荐你的品牌。",
  },
  {
    index: "02",
    title: "证据化评分",
    description:
      "每个分数都保留问题、回答、模型与来源，让结果可以复核，也可以再次验证。",
  },
  {
    index: "03",
    title: "可执行优化",
    description:
      "定位认知差距和影响来源，按优先级生成可落地、可复测的品牌优化方向。",
  },
] as const;

export const workflow = [
  ["输入品牌", "填写品牌名称与已知官网，确认系统识别结果。"],
  ["确认问题", "检查系统生成的真实用户问题与地域范围。"],
  ["启动分析", "选择可用模型，确认预计运行量与成本。"],
  ["查看报告", "阅读评分、证据、限制说明和优化建议。"],
] as const;
