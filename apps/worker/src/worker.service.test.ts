import { describe, expect, it } from "vitest";

import { WorkerService } from "./worker.service.js";

describe("WorkerService", () => {
  it("reports a ready application context", () => {
    expect(new WorkerService().getStatus()).toBe("ready");
  });
});
