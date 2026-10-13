export const productUrl = "https://app.chatway.chat";

export const capabilities = [
  {
    index: "01",
    title: "多模型检测",
    description: "分析用户可能提出的问题，比较各模型对品牌的回答。",
  },
  {
    index: "02",
    title: "证据化评分",
    description: "评分关联原始回答、引用来源和有效样本。",
  },
  {
    index: "03",
    title: "可执行优化",
    description: "按优先级查看建议，确定下一步优化。",
  },
] as const;

export const workflow = [
  ["输入品牌", "填写品牌名称，补充已知官网。"],
  ["确认问题", "选择分析问题和地域。"],
  ["启动分析", "核对模型、预计用量和费用。"],
  ["查看报告", "查看评分、依据和优化建议。"],
] as const;
