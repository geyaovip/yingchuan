import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getRuntimeValue } from "./index.js";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("getRuntimeValue", () => {
  it("reads and trims a Docker secret file", () => {
    const directory = mkdtempSync(join(tmpdir(), "yingchuan-secret-"));
    const path = join(directory, "value");
    writeFileSync(path, "secret-value\n", { mode: 0o600 });
    process.env.EXAMPLE_FILE = path;

    expect(getRuntimeValue("EXAMPLE")).toBe("secret-value");
    rmSync(directory, { force: true, recursive: true });
  });

  it("rejects ambiguous direct and file-backed values", () => {
    process.env.EXAMPLE = "direct";
    process.env.EXAMPLE_FILE = "/tmp/not-read";
    expect(() => getRuntimeValue("EXAMPLE")).toThrow("cannot both be set");
  });

  it("fails closed when production configuration is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EXAMPLE;
    delete process.env.EXAMPLE_FILE;
    expect(() => getRuntimeValue("EXAMPLE")).toThrow("is required");
  });
});
