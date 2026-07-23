import type { NavigationItem } from "@yingchuan/ui";

export interface ProjectCapabilities {
  readonly assistant?: boolean;
  readonly stores?: boolean;
  readonly website?: boolean;
}

const alwaysVisible: readonly NavigationItem[] = [
  { href: "/overview", label: "概览" },
  { href: "/brand", label: "品牌信息" },
  { href: "/reports", label: "AI 可见度" },
  { href: "/prompts", label: "分析问题" },
  { href: "/competitors", label: "竞品" },
  { href: "/sources", label: "认知源" },
  { href: "/optimization", label: "优化建议" },
  { href: "/history", label: "历史报告" },
  { href: "/settings", label: "项目设置" },
];

export function projectNavigation(
  projectId: string,
  capabilities: ProjectCapabilities,
): readonly NavigationItem[] {
  const optional: NavigationItem[] = [];
  if (capabilities.website) optional.push({ href: "/website", label: "官网" });
  if (capabilities.stores) {
    optional.push(
      { href: "/stores", label: "门店" },
      { href: "/locations", label: "城市与区域" },
    );
  }
  if (capabilities.assistant)
    optional.push({ href: "/assistant", label: "品牌管家" });
  return [...alwaysVisible, ...optional].map((item) => ({
    ...item,
    href: `/projects/${projectId}${item.href}`,
  }));
}
