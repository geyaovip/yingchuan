import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import type {
  DependencyHealth,
  ReadinessResponse,
} from "@yingchuan/shared-types";
import { Pool } from "pg";
import { createClient } from "redis";

import {
  SERVICE_NAME,
  SERVICE_VERSION,
  serviceLogger,
} from "./observability.js";

type Probe = () => Promise<void>;

@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly database = new Pool({
    connectionString: getRuntimeValue("DATABASE_URL", {
      fallback:
        "postgresql://yingchuan:yingchuan_local_only@127.0.0.1:55432/yingchuan?schema=public",
    }),
    connectionTimeoutMillis: 1500,
    max: 2,
  });

  async getReadiness(): Promise<ReadinessResponse> {
    const entries = await Promise.all([
      this.runProbe("postgres", async () => {
        await this.database.query("SELECT 1");
      }),
      this.runProbe("redis", async () => {
        const client = createClient({
          url: getRuntimeValue("REDIS_URL", {
            fallback: "redis://:yingchuan_local_only@127.0.0.1:56379/0",
          }),
          socket: { connectTimeout: 1500, reconnectStrategy: false },
        });
        client.on("error", () => undefined);
        try {
          await client.connect();
          await client.ping();
        } finally {
          if (client.isOpen) {
            await client.close();
          }
        }
      }),
      this.runProbe("private_files", async () => {
        const root =
          process.env.PRIVATE_FILE_ROOT ??
          resolve(import.meta.dirname, "../../../storage/private");
        await access(root, constants.R_OK | constants.W_OK);
      }),
    ]);
    const checks = Object.fromEntries(entries);
    const ready = Object.values(checks).every((check) => check.status === "up");

    return {
      checks,
      service: SERVICE_NAME,
      status: ready ? "ready" : "degraded",
      version: SERVICE_VERSION,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.database.end();
  }

  private async runProbe(
    name: string,
    probe: Probe,
  ): Promise<readonly [string, DependencyHealth]> {
    const startedAt = process.hrtime.bigint();
    try {
      await probe();
      return [name, this.probeResult("up", startedAt)];
    } catch (error) {
      serviceLogger.warn(
        {
          dependency: name,
          errorCode: "DEPENDENCY_UNAVAILABLE",
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        "readiness_probe_failed",
      );
      return [name, this.probeResult("down", startedAt)];
    }
  }

  private probeResult(
    status: DependencyHealth["status"],
    startedAt: bigint,
  ): DependencyHealth {
    return {
      latencyMs: Math.round(
        Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      ),
      status,
    };
  }
}
