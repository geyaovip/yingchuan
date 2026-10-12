export const productUrl = "https://app.chatway.chat";

export const capabilities = [
  {
    index: "01",
    title: "多模型检测",
    description:
      "围绕真实用户问题，调用已配置的可用模型，查看它们如何提及、描述和推荐你的品牌。",
  },
  {
    index: "02",
    title: "证据化评分",
    description:
      "报告关联问题、模型回答和官方返回的引用，并说明样本与结果限制。",
  },
  {
    index: "03",
    title: "可执行优化",
    description: "根据真实报告查看优化建议，并回到回答与来源核对依据。",
  },
] as const;

export const workflow = [
  ["输入品牌", "填写品牌名称与已知官网，确认系统识别结果。"],
  ["确认问题", "检查系统生成的真实用户问题与地域范围。"],
  ["启动分析", "选择可用模型，确认预计运行量与成本。"],
  ["查看报告", "阅读评分、证据、限制说明和优化建议。"],
] as const;
