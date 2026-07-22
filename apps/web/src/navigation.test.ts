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
});
