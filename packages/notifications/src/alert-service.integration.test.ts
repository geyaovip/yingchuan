import {
  AlertStatus,
  AuthAudience,
  createDatabaseClient,
  type PrismaClient,
} from "@yingchuan/database";
import { SecretBox } from "@yingchuan/model-gateway";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { AlertApplicationService } from "./alert-service.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const referenceTime = new Date("2099-01-02T03:04:30.000Z");
const idempotencyKey = "alert-evaluation/2099-01-02T03:04";

describe("alert scheduler persistence", () => {
  let adminUserId: string;
  let database: PrismaClient;
  let alertId: string;

  beforeAll(async () => {
    database = createDatabaseClient(databaseUrl);
    const previousRuns = await database.alertEvaluationRun.findMany({
      select: { id: true },
      where: { idempotencyKey },
    });
    await database.auditLog.deleteMany({
      where: { objectId: { in: previousRuns.map(({ id }) => id) } },
    });
    await database.alertEvaluationRun.deleteMany({ where: { idempotencyKey } });
    await database.alertEvent.deleteMany({
      where: { fingerprint: "platform:model_failure_rate_5m" },
    });
    adminUserId = uuidv7();
    await database.user.create({
      data: {
        displayEmail: "alert-integration@example.com",
        emailNormalized: "alert-integration@example.com",
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
    alertId = uuidv7();
    await database.alertEvent.create({
      data: {
        body: "fixture alert",
        context: { fixture: true },
        fingerprint: "platform:model_failure_rate_5m",
        firstTriggeredAt: new Date("2099-01-02T02:00:00.000Z"),
        id: alertId,
        lastTriggeredAt: new Date("2099-01-02T02:00:00.000Z"),
        metricValue: 20,
        ruleCode: "model_failure_rate_5m",
        severity: "warning",
        thresholdValue: 10,
        title: "fixture",
        unit: "percent",
      },
    });
  });

  afterAll(async () => {
    const runs = await database.alertEvaluationRun.findMany({
      select: { id: true },
      where: { idempotencyKey },
    });
    await database.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: adminUserId },
          { objectId: alertId },
          { objectId: { in: runs.map(({ id }) => id) } },
        ],
      },
    });
    await database.alertEvaluationRun.deleteMany({ where: { idempotencyKey } });
    await database.alertEvent.deleteMany({ where: { id: alertId } });
    await database.user.delete({ where: { id: adminUserId } });
    await database.$disconnect();
  });

  const createService = () =>
    new AlertApplicationService(
      database,
      new SecretBox("alert_integration_test_master_key_32_chars", "test-v1"),
      {
        send: () => Promise.resolve({ messageId: "not-used" }),
      },
    );

  it("acknowledges an active alert through the platform admin boundary", async () => {
    const alert = await createService().acknowledge(alertId, {
      audience: AuthAudience.admin,
      email: "alert-integration@example.com",
      userId: adminUserId,
    });
    expect(alert.acknowledgedById).toBe(adminUserId);
    expect(alert.acknowledgedAt).toBeInstanceOf(Date);
  });

  it("resolves a recovered alert and does not repeat the schedule window", async () => {
    const service = createService();
    const first = await service.runScheduled(referenceTime);
    const second = await service.runScheduled(referenceTime);
    const alert = await database.alertEvent.findUniqueOrThrow({
      where: { id: alertId },
    });

    expect(first.status).toBe("completed");
    expect(second.id).toBe(first.id);
    expect(alert.status).toBe(AlertStatus.resolved);
    expect(
      await database.alertEvaluationRun.count({ where: { idempotencyKey } }),
    ).toBe(1);
  });
});
