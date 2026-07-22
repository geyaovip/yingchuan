import {
  AuthAudience,
  LegalHoldScopeType,
  RoleScope,
  createDatabaseClient,
} from "@yingchuan/database";
import { afterAll, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { DataLifecycleApplicationService } from "./lifecycle-service.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const database = createDatabaseClient(databaseUrl);
const unique = uuidv7();
const userId = uuidv7();
const workspaceId = uuidv7();
const projectId = uuidv7();
const sourceId = uuidv7();
const snapshotId = uuidv7();
const runKeys = [
  `lifecycle-integration-held/${unique}`,
  `lifecycle-integration-purge/${unique}`,
];

describe("data lifecycle integration", () => {
  it("skips legal holds, then purges expired content and audits both paths", async () => {
    const role = await database.role.upsert({
      create: {
        code: "super_admin",
        description: "Platform super administrator",
        id: uuidv7(),
        scope: RoleScope.platform,
      },
      update: {},
      where: { scope_code: { code: "super_admin", scope: RoleScope.platform } },
    });
    await database.user.create({
      data: {
        displayEmail: `lifecycle-${unique}@example.test`,
        emailNormalized: `lifecycle-${unique}@example.test`,
        id: userId,
      },
    });
    await database.platformRoleAssignment.create({
      data: { id: uuidv7(), roleId: role.id, userId },
    });
    await database.workspace.create({
      data: {
        createdById: userId,
        id: workspaceId,
        name: "Lifecycle integration",
        slug: `lifecycle-${unique}`,
      },
    });
    await database.project.create({
      data: {
        createdById: userId,
        id: projectId,
        name: "Lifecycle project",
        workspaceId,
      },
    });
    await database.knowledgeSource.create({
      data: {
        id: sourceId,
        normalizedUrl: `https://example.test/${unique}`,
        originalUrl: `https://example.test/${unique}`,
        projectId,
        type: "official_website",
      },
    });
    await database.contentSnapshot.create({
      data: {
        contentHash: "a".repeat(64),
        extractedText: "expired private page body",
        fetchedAt: new Date(Date.now() - 181 * 24 * 60 * 60 * 1_000),
        finalUrl: `https://example.test/${unique}`,
        httpStatus: 200,
        id: snapshotId,
        mimeType: "text/html",
        sourceId,
      },
    });

    const lifecycle = new DataLifecycleApplicationService(
      database,
      "/tmp/yingchuan-lifecycle-integration",
    );
    const actor = {
      audience: AuthAudience.admin,
      email: `lifecycle-${unique}@example.test`,
      stepUpUntil: new Date(Date.now() + 60_000),
      userId,
    };
    const hold = await lifecycle.createLegalHold(
      {
        reason: "Preserve evidence for an active legal review",
        scopeId: projectId,
        scopeType: LegalHoldScopeType.project,
      },
      actor,
    );

    const heldRun = await lifecycle.run(runKeys[0]!);
    expect(heldRun.status).toBe("completed");
    expect(
      await database.contentSnapshot.findUnique({ where: { id: snapshotId } }),
    ).toMatchObject({
      contentPurgedAt: null,
      extractedText: "expired private page body",
    });

    await lifecycle.releaseLegalHold(hold.id, actor);
    const purgeRun = await lifecycle.run(runKeys[1]!);
    expect(purgeRun.status).toBe("completed");
    expect(
      await database.contentSnapshot.findUnique({ where: { id: snapshotId } }),
    ).toMatchObject({ contentPurgedAt: expect.any(Date), extractedText: null });
    expect(
      await database.auditLog.count({
        where: {
          action: {
            in: [
              "data_lifecycle.legal_hold.create",
              "data_lifecycle.legal_hold.release",
              "data_lifecycle.run",
            ],
          },
          OR: [
            { actorId: userId },
            { objectId: heldRun.id },
            { objectId: purgeRun.id },
          ],
        },
      }),
    ).toBe(4);
  });
});

afterAll(async () => {
  const runs = await database.dataLifecycleRun.findMany({
    select: { id: true },
    where: { idempotencyKey: { in: runKeys } },
  });
  await database.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: userId },
        { objectId: { in: runs.map((run) => run.id) } },
      ],
    },
  });
  await database.legalHold.deleteMany({ where: { createdById: userId } });
  await database.dataLifecycleRun.deleteMany({
    where: { idempotencyKey: { in: runKeys } },
  });
  await database.project.deleteMany({ where: { id: projectId } });
  await database.workspace.deleteMany({ where: { id: workspaceId } });
  await database.platformRoleAssignment.deleteMany({ where: { userId } });
  await database.user.deleteMany({ where: { id: userId } });
  await database.$disconnect();
});
