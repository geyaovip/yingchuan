import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WorkerService, writeWorkerHeartbeat } from "./worker.service.js";

describe("WorkerService", () => {
  it("reports a ready application context", () => {
    expect(new WorkerService().getStatus()).toBe("ready");
  });

  it("writes a private heartbeat for the container health check", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yingchuan-worker-"));
    const heartbeatFile = join(directory, "heartbeat");
    try {
      await writeWorkerHeartbeat(heartbeatFile, 1_234);
      expect(await readFile(heartbeatFile, "utf8")).toBe("1234");
      expect((await stat(heartbeatFile)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
