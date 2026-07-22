import type { OutboxEvent } from "@yingchuan/database";
import { Queue } from "bullmq";

import type { OutboxQueue } from "./outbox.js";

export class BullMqOutboxQueue implements OutboxQueue {
  private readonly queue: Queue;

  constructor(name: string, redisUrl: string) {
    const parsed = new URL(redisUrl);
    this.queue = new Queue(name, {
      connection: {
        db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
        host: parsed.hostname,
        password: parsed.password || undefined,
        port: Number(parsed.port || 6379),
        username: parsed.username || undefined,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { delay: 1000, type: "exponential" },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  async enqueue(event: OutboxEvent): Promise<void> {
    await this.queue.add(
      event.eventType,
      {
        actor: { id: event.actorId, type: event.actorType },
        aggregate: {
          id: event.aggregateId,
          type: event.aggregateType,
          version: event.aggregateVersion,
        },
        idempotencyKey: event.idempotencyKey,
        messageId: event.id,
        occurredAt: event.occurredAt.toISOString(),
        payload: event.payload,
        traceId: event.traceId,
        type: event.eventType,
        workspaceId: event.workspaceId,
      },
      { jobId: event.id },
    );
  }

  async hasJob(eventId: string): Promise<boolean> {
    return (await this.queue.getJob(eventId)) !== undefined;
  }
}
