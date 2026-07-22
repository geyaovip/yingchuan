import { describe, expect, it } from "vitest";

import { AppService } from "./app.service.js";

describe("AppService", () => {
  it("reports a healthy API", () => {
    expect(new AppService().getHealth()).toEqual({
      service: "yingchuan-api",
      status: "ok",
      version: "0.1.0",
    });
  });
});
