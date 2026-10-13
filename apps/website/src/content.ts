export const productUrl = "https://app.chatway.chat";

export const capabilities = [
  {
    index: "01",
    title: "多模型检测",
    description: "按问题和模型查看提及率、推荐率与品牌表现。",
  },
  {
    index: "02",
    title: "证据化评分",
    description: "从原始回答核对评分依据，查看引用域名与文章排行。",
  },
  {
    index: "03",
    title: "可执行优化",
    description: "将建议转为任务，记录措施与证据，按原配置复测。",
  },
] as const;

export const workflow = [
  ["输入品牌", "填写品牌名称，补充已知官网。"],
  ["确认问题", "选择分析问题和地域。"],
  ["启动分析", "核对模型、预计用量和费用。"],
  ["查看报告", "查看评分、依据和优化建议。"],
] as const;
