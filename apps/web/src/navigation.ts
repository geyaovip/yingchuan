import type { NavigationItem } from "@yingchuan/ui";

export interface ProjectCapabilities {
  readonly assistant?: boolean;
  readonly stores?: boolean;
  readonly website?: boolean;
}

export function hasProjectCapability(
  capabilities: readonly { readonly code: string; readonly enabled: boolean }[],
  code: string,
): boolean {
  return capabilities.some((item) => item.code === code && item.enabled);
}

export function onboardingIsComplete(
  projectStatus: string,
  onboardingStatus: string,
): boolean {
  return projectStatus === "ready" || onboardingStatus === "confirmed";
}

const alwaysVisible: readonly NavigationItem[] = [
  { href: "/overview", icon: "dashboard", group: "品牌", label: "概览" },
  { href: "/prompts", icon: "prompts", label: "用户提问" },
  { href: "/brand", icon: "brand", label: "品牌信息" },
  { href: "/competitors", icon: "competitors", label: "竞品" },
  { href: "/reports", icon: "reports", group: "数据", label: "可见度分析" },
  { href: "/insights", icon: "dashboard", label: "数据洞察" },
  { href: "/answers", icon: "answers", label: "大模型回答记录" },
  { href: "/history", icon: "history", label: "历史报告" },
  { href: "/sources", icon: "sources", group: "优化", label: "认知源" },
  { href: "/optimization", icon: "optimization", label: "优化建议" },
  { href: "/optimization-tasks", icon: "optimization", label: "优化任务" },
  { href: "/monitoring", icon: "history", group: "配置", label: "监测计划" },
  { href: "/settings", icon: "settings", group: "配置", label: "项目设置" },
];

export function projectNavigation(
  projectId: string,
  capabilities: ProjectCapabilities,
): readonly NavigationItem[] {
  const optional: NavigationItem[] = [];
  if (capabilities.website)
    optional.push({ href: "/website", icon: "sources", label: "官网" });
  if (capabilities.stores) {
    optional.push(
      { href: "/stores", label: "门店" },
      { href: "/locations", label: "城市与区域" },
    );
  }
  if (capabilities.assistant)
    optional.push({ href: "/assistant", icon: "agent", label: "品牌管家" });
  return [...alwaysVisible, ...optional].map((item) => ({
    ...item,
    href: `/projects/${projectId}${item.href}`,
  }));
}
