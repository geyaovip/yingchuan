import { describe, expect, it } from "vitest";

import {
  hasProjectCapability,
  onboardingIsComplete,
  projectNavigation,
} from "./navigation";

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
      icon: "agent",
      label: "品牌管家",
    });
  });
});

describe("project route state", () => {
  it("opens completed onboarding at the project overview", () => {
    expect(onboardingIsComplete("ready", "processing")).toBe(true);
    expect(onboardingIsComplete("draft", "confirmed")).toBe(true);
    expect(onboardingIsComplete("identifying", "identifying")).toBe(false);
  });

  it("requires an enabled capability for the direct website route", () => {
    expect(
      hasProjectCapability([{ code: "website", enabled: false }], "website"),
    ).toBe(false);
    expect(
      hasProjectCapability([{ code: "website", enabled: true }], "website"),
    ).toBe(true);
  });
});
