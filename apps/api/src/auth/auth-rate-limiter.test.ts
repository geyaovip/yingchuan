import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { AuthRateLimiter } from "./auth-rate-limiter.js";

describe("AuthRateLimiter", () => {
  const limiters: AuthRateLimiter[] = [];

  afterEach(async () => {
    await Promise.all(
      limiters.map((limiter) => limiter.onApplicationShutdown()),
    );
    limiters.length = 0;
  });

  it("does not consume any counters when one key is already limited", async () => {
    const limiter = new AuthRateLimiter();
    limiters.push(limiter);
    const suffix = randomUUID();
    const sharedCounter = `atomic-shared:${suffix}`;
    const strictCounter = `atomic-strict:${suffix}`;
    const counters = [
      { key: sharedCounter, limit: 2, ttlMs: 30_000 },
      { key: strictCounter, limit: 1, ttlMs: 30_000 },
    ] as const;

    await expect(limiter.consume(counters)).resolves.toBe(true);
    await expect(limiter.consume(counters)).resolves.toBe(false);
    await expect(
      limiter.consume([{ key: sharedCounter, limit: 2, ttlMs: 30_000 }]),
    ).resolves.toBe(true);
  });

  it("allows an empty policy set without connecting to Redis", async () => {
    const limiter = new AuthRateLimiter();
    limiters.push(limiter);

    await expect(limiter.consume([])).resolves.toBe(true);
  });
});
