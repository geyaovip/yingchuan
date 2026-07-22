import {
  OutboxStatus,
  type OutboxEvent,
  type Prisma,
  type PrismaClient,
} from "@yingchuan/database";
import { v7 as uuidv7 } from "uuid";

export interface OutboxQueue {
  enqueue(event: OutboxEvent): Promise<void>;
}

export interface EventInput {
  readonly actorId?: string;
  readonly actorType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly aggregateVersion: number;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly payload: Prisma.InputJsonValue;
  readonly traceId: string;
  readonly workspaceId?: string;
}

export type TransactionOperation<T> = (
  transaction: Prisma.TransactionClient,
) => Promise<T>;

export type EventHandler = (
  transaction: Prisma.TransactionClient,
  event: OutboxEvent,
) => Promise<void>;

export class TransactionalOutbox {
  constructor(private readonly database: PrismaClient) {}

  async executeWithEvent<T>(
    input: EventInput,
    operation: TransactionOperation<T>,
  ): Promise<T> {
    return this.database.$transaction(async (transaction) => {
      const result = await operation(transaction);
      await transaction.outboxEvent.create({
        data: {
          actorId: input.actorId,
          actorType: input.actorType,
          aggregateId: input.aggregateId,
          aggregateType: input.aggregateType,
          aggregateVersion: input.aggregateVersion,
          eventType: input.eventType,
          id: uuidv7(),
          idempotencyKey: input.idempotencyKey,
          payload: input.payload,
          traceId: input.traceId,
          workspaceId: input.workspaceId,
        },
      });
      return result;
    });
  }

  async dispatchBatch(
    queue: OutboxQueue,
    workerId: string,
    limit = 100,
    maxAttempts = 3,
  ): Promise<{ deadLettered: number; published: number }> {
    const staleLock = new Date(Date.now() - 60_000);
    const candidates = await this.database.outboxEvent.findMany({
      orderBy: { createdAt: "asc" },
      take: limit,
      where: {
        attempts: { lt: maxAttempts },
        availableAt: { lte: new Date() },
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }],
        status: OutboxStatus.pending,
      },
    });
    let published = 0;
    let deadLettered = 0;

    for (const candidate of candidates) {
      const claimed = await this.database.outboxEvent.updateMany({
        data: {
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: workerId,
        },
        where: {
          id: candidate.id,
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleLock } }],
          status: OutboxStatus.pending,
        },
      });
      if (claimed.count === 0) continue;

      try {
        const event = await this.database.outboxEvent.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        await queue.enqueue(event);
        await this.database.outboxEvent.update({
          data: {
            lastErrorCode: null,
            lockedAt: null,
            lockedBy: null,
            publishedAt: new Date(),
            status: OutboxStatus.published,
          },
          where: { id: event.id },
        });
        published += 1;
      } catch {
        const nextAttempt = candidate.attempts + 1;
        const dead = nextAttempt >= maxAttempts;
        await this.database.outboxEvent.update({
          data: {
            availableAt: new Date(Date.now() + 2 ** nextAttempt * 1000),
            lastErrorCode: "OUTBOX_PUBLISH_FAILED",
            lockedAt: null,
            lockedBy: null,
            status: dead ? OutboxStatus.dead_letter : OutboxStatus.pending,
          },
          where: { id: candidate.id },
        });
        if (dead) deadLettered += 1;
      }
    }

    return { deadLettered, published };
  }

  async consumeOnce(
    eventId: string,
    consumer: string,
    handler: EventHandler,
  ): Promise<boolean> {
    try {
      return await this.database.$transaction(
        async (transaction) => {
          const receipt = await transaction.inboxReceipt.findUnique({
            where: { consumer_eventId: { consumer, eventId } },
          });
          if (receipt) return false;

          const event = await transaction.outboxEvent.findUniqueOrThrow({
            where: { id: eventId },
          });
          await handler(transaction, event);
          await transaction.inboxReceipt.create({
            data: { consumer, eventId, id: uuidv7() },
          });
          return true;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return false;
      }
      throw error;
    }
  }

  async reconcileUnconsumed(olderThanMs = 60_000): Promise<number> {
    const result = await this.database.outboxEvent.updateMany({
      data: {
        availableAt: new Date(),
        publishedAt: null,
        status: OutboxStatus.pending,
      },
      where: {
        publishedAt: { lt: new Date(Date.now() - olderThanMs) },
        receipts: { none: {} },
        status: OutboxStatus.published,
      },
    });
    return result.count;
  }
}
