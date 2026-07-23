import { describe, expect, it } from "vitest";

import { projectNavigation } from "./navigation";

describe("projectNavigation", () => {
  it("adds only modules supported by project capabilities", () => {
    const labels = projectNavigation("project-1", {
      stores: true,
      website: true,
    }).map((item) => item.label);
    expect(labels).toContain("官网");
    expect(labels).toContain("门店");
    expect(labels).toContain("城市与区域");
    expect(labels).not.toContain("品牌管家");
  });

  it("adds the brand assistant only after its capability is enabled", () => {
    const items = projectNavigation("project-1", { assistant: true });
    expect(items).toContainEqual({
      href: "/projects/project-1/assistant",
      label: "品牌管家",
    });
  });
});
