import {
  AuthAudience,
  createDatabaseClient,
  OperationsDailyReportStatus,
  type PrismaClient,
} from "@yingchuan/database";
import { SecretBox } from "@yingchuan/model-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { OperationsDailyReportApplicationService } from "./daily-report-service.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const referenceTime = new Date("2099-01-03T02:00:00.000Z");
const idempotencyKey = "operations-daily/Asia/Shanghai/2099-01-02";

describe("operations daily report persistence", () => {
  let adminUserId: string;
  let database: PrismaClient;

  beforeAll(async () => {
    database = createDatabaseClient(databaseUrl);
    const previous = await database.operationsDailyReport.findUnique({
      where: { idempotencyKey },
    });
    if (previous) {
      await database.notificationDelivery.deleteMany({
        where: {
          payload: { path: ["reportId"], equals: previous.id },
        },
      });
      await database.auditLog.deleteMany({ where: { objectId: previous.id } });
      await database.operationsDailyReport.delete({
        where: { id: previous.id },
      });
    }
    adminUserId = uuidv7();
    await database.user.create({
      data: {
        displayEmail: "daily-report-integration@example.com",
        emailNormalized: "daily-report-integration@example.com",
        id: adminUserId,
      },
    });
    const superAdmin = await database.role.upsert({
      create: {
        code: "super_admin",
        description: "Platform super administrator",
        id: uuidv7(),
        scope: "platform",
      },
      update: {},
      where: {
        scope_code: { code: "super_admin", scope: "platform" },
      },
    });
    await database.platformRoleAssignment.create({
      data: {
        id: uuidv7(),
        roleId: superAdmin.id,
        userId: adminUserId,
      },
    });
  });

  afterAll(async () => {
    const report = await database.operationsDailyReport.findUnique({
      where: { idempotencyKey },
    });
    if (report) {
      await database.notificationDelivery.deleteMany({
        where: {
          payload: { path: ["reportId"], equals: report.id },
        },
      });
      await database.auditLog.deleteMany({ where: { objectId: report.id } });
      await database.operationsDailyReport.delete({
        where: { id: report.id },
      });
    }
    await database.user.delete({ where: { id: adminUserId } });
    await database.$disconnect();
  });

  const createService = () =>
    new OperationsDailyReportApplicationService(
      database,
      new SecretBox("daily_report_integration_master_key_32", "test-v1"),
      {
        send: () => Promise.resolve({ messageId: "not-used" }),
      },
    );

  it("creates one immutable snapshot for a schedule window", async () => {
    const service = createService();
    const first = await service.runScheduled(referenceTime);
    const second = await service.runScheduled(referenceTime);

    expect(first.status).toBe(OperationsDailyReportStatus.completed);
    expect(second.id).toBe(first.id);
    expect(first.snapshot).toMatchObject({
      paidUsers: null,
      revenueMicros: null,
    });
    expect(
      await database.operationsDailyReport.count({
        where: { idempotencyKey },
      }),
    ).toBe(1);
  });

  it("lists reports only through the platform admin boundary", async () => {
    const service = createService();
    const reports = await service.list({
      audience: AuthAudience.admin,
      email: "daily-report-integration@example.com",
      userId: adminUserId,
    });

    expect(
      reports.some((report) => report.idempotencyKey === idempotencyKey),
    ).toBe(true);
    await expect(
      service.list({
        audience: AuthAudience.user,
        email: "daily-report-integration@example.com",
        userId: adminUserId,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
});
