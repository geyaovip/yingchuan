import { SecretBox } from "@yingchuan/model-gateway";
import { describe, expect, it, vi } from "vitest";

import {
  OperationsDailyReportApplicationService,
  operationsDailyWindow,
} from "./daily-report-service.js";

describe("operations daily schedule", () => {
  it("uses the previous Beijing calendar day after 09:00", () => {
    const window = operationsDailyWindow(new Date("2026-07-23T01:00:00.000Z"));

    expect(window).toEqual({
      idempotencyKey: "operations-daily/Asia/Shanghai/2026-07-22",
      reportDate: "2026-07-22",
      windowEnd: new Date("2026-07-22T16:00:00.000Z"),
      windowStart: new Date("2026-07-21T16:00:00.000Z"),
    });
  });

  it("does not create yesterday's report before the 09:00 schedule", () => {
    const window = operationsDailyWindow(new Date("2026-07-23T00:59:59.999Z"));

    expect(window.reportDate).toBe("2026-07-21");
    expect(window.windowStart.toISOString()).toBe("2026-07-20T16:00:00.000Z");
  });
});

describe("operations daily Telegram delivery", () => {
  it("decrypts the configured channel and marks a due delivery sent", async () => {
    const secretBox = new SecretBox(
      "daily_report_delivery_test_master_key_32",
      "test-v1",
    );
    const send = vi.fn().mockResolvedValue({ messageId: "message-1" });
    const deliveryUpdate = vi.fn().mockResolvedValue({});
    const channelUpdate = vi.fn().mockResolvedValue({});
    const database = {
      notificationChannelConfig: { update: channelUpdate },
      notificationDelivery: {
        findMany: vi.fn().mockResolvedValue([
          {
            attempts: 0,
            createdAt: new Date(),
            id: "delivery-1",
            status: "queued",
          },
        ]),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          attempts: 1,
          channelConfig: {
            enabled: true,
            encryptedChatId: JSON.stringify(secretBox.encrypt("chat-123456")),
            encryptedToken: JSON.stringify(
              secretBox.encrypt("token-123456789"),
            ),
          },
          channelConfigId: "channel-1",
          id: "delivery-1",
          maxAttempts: 4,
          payload: { text: "日报内容" },
        }),
        update: deliveryUpdate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new OperationsDailyReportApplicationService(
      database as never,
      secretBox,
      { send },
    );

    expect(
      await service.processDueDeliveries(new Date("2026-07-23T01:00:00.000Z")),
    ).toEqual({ failed: 0, sent: 1 });
    expect(send).toHaveBeenCalledWith({
      chatId: "chat-123456",
      text: "日报内容",
      token: "token-123456789",
    });
    expect(deliveryUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerMessageId: "message-1",
          status: "sent",
        }),
      }),
    );
    expect(channelUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastErrorCode: null }),
      }),
    );
  });

  it("keeps a failed delivery queued for the documented retry window", async () => {
    const secretBox = new SecretBox(
      "daily_report_retry_test_master_key_32_chars",
      "test-v1",
    );
    const deliveryUpdate = vi.fn().mockResolvedValue({});
    const database = {
      notificationChannelConfig: { update: vi.fn().mockResolvedValue({}) },
      notificationDelivery: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { attempts: 0, id: "delivery-2", status: "queued" },
          ]),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          attempts: 1,
          channelConfig: {
            enabled: true,
            encryptedChatId: JSON.stringify(secretBox.encrypt("chat-123456")),
            encryptedToken: JSON.stringify(
              secretBox.encrypt("token-123456789"),
            ),
          },
          channelConfigId: "channel-1",
          id: "delivery-2",
          maxAttempts: 4,
          payload: { text: "日报内容" },
        }),
        update: deliveryUpdate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new OperationsDailyReportApplicationService(
      database as never,
      secretBox,
      {
        send: vi.fn().mockRejectedValue(new Error("TELEGRAM_DELIVERY_FAILED")),
      },
    );
    const referenceTime = new Date("2026-07-23T01:00:00.000Z");

    expect(await service.processDueDeliveries(referenceTime)).toEqual({
      failed: 1,
      sent: 0,
    });
    expect(deliveryUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          errorCode: "TELEGRAM_DELIVERY_FAILED",
          nextAttemptAt: new Date("2026-07-23T01:01:00.000Z"),
          status: "queued",
        }),
      }),
    );
  });
});
