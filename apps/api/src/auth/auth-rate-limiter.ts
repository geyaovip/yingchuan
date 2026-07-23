import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { getRuntimeValue } from "@yingchuan/runtime-config";
import { createClient, type RedisClientType } from "redis";

const consumeScript = `
for index, key in ipairs(KEYS) do
  local current = tonumber(redis.call('GET', key) or '0')
  local limit = tonumber(ARGV[index * 2])
  if current >= limit then return 0 end
end

for index, key in ipairs(KEYS) do
  local current = redis.call('INCR', key)
  if current == 1 then
    redis.call('PEXPIRE', key, ARGV[index * 2 - 1])
  end
end

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
    if (keys.length === 0) return true;
    const client = await this.getClient();
    const allowed = await client.eval(consumeScript, {
      arguments: keys.flatMap((item) => [
        String(item.ttlMs),
        String(item.limit),
      ]),
      keys: keys.map((item) => `${this.prefix}:${item.key}`),
    });
    return allowed === 1;
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
