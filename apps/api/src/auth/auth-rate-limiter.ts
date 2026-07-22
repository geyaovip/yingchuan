import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { createClient, type RedisClientType } from "redis";

const consumeScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if current > tonumber(ARGV[2]) then return 0 end
return 1
`;

@Injectable()
export class AuthRateLimiter implements OnApplicationShutdown {
  private client?: RedisClientType;
  private readonly prefix = getRuntimeValue("AUTH_RATE_LIMIT_PREFIX", {
    fallback: "auth-rate",
  });

  async consume(
    keys: readonly { key: string; limit: number; ttlMs: number }[],
  ): Promise<boolean> {
    const client = await this.getClient();
    for (const item of keys) {
      const allowed = await client.eval(consumeScript, {
        arguments: [String(item.ttlMs), String(item.limit)],
        keys: [`${this.prefix}:${item.key}`],
      });
      if (allowed !== 1) return false;
    }
    return true;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client?.isOpen) await this.client.close();
  }

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({
        url: getRuntimeValue("REDIS_URL", {
          fallback: "redis://:yingchuan_local_only@127.0.0.1:56379/0",
        }),
      });
      this.client.on("error", () => undefined);
    }
    if (!this.client.isOpen) await this.client.connect();
    return this.client;
  }
}
