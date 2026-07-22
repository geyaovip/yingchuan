import {
  createDatabaseClient,
  OutboxStatus,
  type PrismaClient,
} from "@yingchuan/database";
import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { BullMqOutboxQueue } from "./bullmq-queue.js";
import { TransactionalOutbox, type OutboxQueue } from "./outbox.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const redisUrl =
  process.env.REDIS_URL ?? "redis://:yingchuan_local_only@127.0.0.1:56379/0";
const queueName = `outbox-spike-${process.pid}`;

describe("TransactionalOutbox integration", () => {
  let database: PrismaClient;
  let outbox: TransactionalOutbox;
  let queue: BullMqOutboxQueue;

  beforeAll(() => {
    database = createDatabaseClient(databaseUrl);
    outbox = new TransactionalOutbox(database);
    queue = new BullMqOutboxQueue(queueName, redisUrl);
  });

  afterAll(async () => {
    await database.inboxReceipt.deleteMany({
      where: { consumer: { startsWith: "outbox-spike" } },
    });
    await database.outboxEvent.deleteMany({
      where: { idempotencyKey: { startsWith: "outbox-spike" } },
    });
    await database.industry.deleteMany({
      where: { code: { startsWith: "outbox_spike" } },
    });
    await queue.close();
    const cleanupQueue = new Queue(queueName, {
      connection: {
        host: new URL(redisUrl).hostname,
        password: new URL(redisUrl).password || undefined,
        port: Number(new URL(redisUrl).port || 6379),
      },
    });
    await cleanupQueue.obliterate({ force: true });
    await cleanupQueue.close();
    await database.$disconnect();
  });

  it("preserves atomic writes, idempotent delivery, consumption and reconciliation", async () => {
    const aggregateId = uuidv7();
    const idempotencyKey = `outbox-spike:industry:${aggregateId}`;
    await outbox.executeWithEvent(
      {
        actorType: "system",
        aggregateId,
        aggregateType: "Industry",
        aggregateVersion: 1,
        eventType: "industry.created.v1",
        idempotencyKey,
        payload: { industryId: aggregateId },
        traceId: "a".repeat(32),
      },
      (transaction) =>
        transaction.industry.create({
          data: {
            code: `outbox_spike_${aggregateId.replaceAll("-", "")}`,
            id: aggregateId,
            name: "Outbox Spike",
          },
        }),
    );

    const event = await database.outboxEvent.findUniqueOrThrow({
      where: { idempotencyKey },
    });
    expect(await database.industry.count({ where: { id: aggregateId } })).toBe(
      1,
    );

    const firstDispatch = await outbox.dispatchBatch(queue, "spike-dispatcher");
    expect(firstDispatch.deadLettered).toBe(0);
    expect(firstDispatch.published).toBeGreaterThanOrEqual(1);
    expect(await queue.hasJob(event.id)).toBe(true);
    await outbox.dispatchBatch(queue, "spike-dispatcher");
    expect(await queue.hasJob(event.id)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await outbox.reconcileUnconsumed(0)).toBeGreaterThanOrEqual(1);
    const reconciled = await outbox.dispatchBatch(queue, "spike-reconciler");
    expect(reconciled.deadLettered).toBe(0);
    expect(reconciled.published).toBeGreaterThanOrEqual(1);
    expect(await queue.hasJob(event.id)).toBe(true);

    const handler = async (
      transaction: Parameters<
        Parameters<TransactionalOutbox["consumeOnce"]>[2]
      >[0],
    ): Promise<void> => {
      await transaction.industry.update({
        data: { name: "Outbox Spike Processed" },
        where: { id: aggregateId },
      });
    };
    expect(
      await outbox.consumeOnce(event.id, "outbox-spike-consumer", handler),
    ).toBe(true);
    expect(
      await outbox.consumeOnce(event.id, "outbox-spike-consumer", handler),
    ).toBe(false);
    expect(
      await database.inboxReceipt.count({
        where: { consumer: "outbox-spike-consumer", eventId: event.id },
      }),
    ).toBe(1);
    expect(
      await database.industry.findUniqueOrThrow({ where: { id: aggregateId } }),
    ).toMatchObject({ name: "Outbox Spike Processed" });
  });

  it("rolls back the domain write when the transaction fails", async () => {
    const aggregateId = uuidv7();
    const idempotencyKey = `outbox-spike:rollback:${aggregateId}`;

    await expect(
      outbox.executeWithEvent(
        {
          actorType: "system",
          aggregateId,
          aggregateType: "Industry",
          aggregateVersion: 1,
          eventType: "industry.created.v1",
          idempotencyKey,
          payload: { industryId: aggregateId },
          traceId: "b".repeat(32),
        },
        async (transaction) => {
          await transaction.industry.create({
            data: {
              code: `outbox_spike_${aggregateId.replaceAll("-", "")}`,
              id: aggregateId,
              name: "Must Roll Back",
            },
          });
          throw new Error("expected rollback");
        },
      ),
    ).rejects.toThrow("expected rollback");

    expect(await database.industry.count({ where: { id: aggregateId } })).toBe(
      0,
    );
    expect(
      await database.outboxEvent.count({ where: { idempotencyKey } }),
    ).toBe(0);
  });

  it("moves permanently failing publications to the dead letter state", async () => {
    const aggregateId = uuidv7();
    const idempotencyKey = `outbox-spike:dead-letter:${aggregateId}`;
    await outbox.executeWithEvent(
      {
        actorType: "system",
        aggregateId,
        aggregateType: "Industry",
        aggregateVersion: 1,
        eventType: "industry.created.v1",
        idempotencyKey,
        payload: { industryId: aggregateId },
        traceId: "c".repeat(32),
      },
      (transaction) =>
        transaction.industry.create({
          data: {
            code: `outbox_spike_${aggregateId.replaceAll("-", "")}`,
            id: aggregateId,
            name: "Dead Letter Probe",
          },
        }),
    );
    const failingQueue: OutboxQueue = {
      enqueue: () => Promise.reject(new Error("redis unavailable")),
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await database.outboxEvent.update({
        data: { availableAt: new Date(0) },
        where: { idempotencyKey },
      });
      await outbox.dispatchBatch(failingQueue, "failing-dispatcher", 1, 3);
    }

    expect(
      await database.outboxEvent.findUniqueOrThrow({
        where: { idempotencyKey },
      }),
    ).toMatchObject({
      attempts: 3,
      lastErrorCode: "OUTBOX_PUBLISH_FAILED",
      status: OutboxStatus.dead_letter,
    });
  });
});
