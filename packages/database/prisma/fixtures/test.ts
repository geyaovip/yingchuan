import { PrismaPg } from "@prisma/adapter-pg";

import {
  ApiMode,
  ConfigStatus,
  ModelFamily,
  PrismaClient,
  RoleScope,
} from "../../src/generated/client.js";
import { assertTestFixtureTarget } from "../../src/fixture-safety.js";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://yingchuan_test:yingchuan_test_local_only@127.0.0.1:55433/yingchuan_test?schema=public";
const databaseName = new URL(testDatabaseUrl).pathname.slice(1);

assertTestFixtureTarget(process.env.NODE_ENV, databaseName);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
});

const permissions = [
  ["workspace.settings.manage", "管理工作区设置"],
  ["workspace.delete", "删除工作区"],
  ["member.manage", "管理成员与角色"],
  ["project.manage", "创建和编辑项目"],
  ["analysis.run", "发起分析"],
  ["source.manage", "维护认知源"],
  ["store.manage", "维护门店"],
  ["report.view", "查看报告"],
  ["optimization.manage", "管理优化任务"],
  ["usage.view", "查看用量"],
] as const;

const rolePermissionCodes: Record<string, string[]> = {
  owner: permissions.map(([code]) => code),
  admin: permissions
    .map(([code]) => code)
    .filter(
      (code) =>
        !["workspace.delete", "workspace.settings.manage"].includes(code),
    ),
  analyst: [
    "project.manage",
    "analysis.run",
    "source.manage",
    "store.manage",
    "report.view",
    "optimization.manage",
    "usage.view",
  ],
  operator: [
    "source.manage",
    "store.manage",
    "report.view",
    "optimization.manage",
  ],
  viewer: ["report.view"],
};

const roleCodes = Object.keys(rolePermissionCodes);
const idFor = (group: number, index: number): string =>
  `019f87ef-${group.toString(16).padStart(4, "0")}-7000-8000-${index
    .toString(16)
    .padStart(12, "0")}`;

async function loadFixtures(): Promise<void> {
  await prisma.$transaction([
    prisma.dataLifecycleRun.deleteMany(),
    prisma.legalHold.deleteMany(),
    prisma.modelCallLog.deleteMany(),
    prisma.notificationDelivery.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationChannelConfig.deleteMany(),
    prisma.adminTodo.deleteMany(),
    prisma.agentAction.deleteMany(),
    prisma.agentRun.deleteMany(),
    prisma.reportViewEvent.deleteMany(),
    prisma.optimizationRecommendation.deleteMany(),
    prisma.reportVersion.deleteMany(),
    prisma.report.deleteMany(),
    prisma.visibilityDimensionScore.deleteMany(),
    prisma.visibilityScore.deleteMany(),
    prisma.entityReviewIssue.deleteMany(),
    prisma.factClaim.deleteMany(),
    prisma.entityMention.deleteMany(),
    prisma.runParseResult.deleteMany(),
    prisma.competitorAlias.deleteMany(),
    prisma.competitor.deleteMany(),
    prisma.modelRunResult.deleteMany(),
    prisma.runAttempt.deleteMany(),
    prisma.modelRun.deleteMany(),
    prisma.analysisJob.deleteMany(),
    prisma.usageLedgerEntry.deleteMany(),
    prisma.promptVersion.deleteMany(),
    prisma.prompt.deleteMany(),
    prisma.contentSnapshot.deleteMany(),
    prisma.sourceFetchJob.deleteMany(),
    prisma.knowledgeSource.deleteMany(),
    prisma.identificationJob.deleteMany(),
    prisma.brandCandidate.deleteMany(),
    prisma.idempotencyRecord.deleteMany(),
    prisma.projectCapability.deleteMany(),
    prisma.project.deleteMany(),
    prisma.brandEntityVersion.deleteMany(),
    prisma.brandAlias.deleteMany(),
    prisma.brandEntity.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.workspaceInvitation.deleteMany(),
    prisma.workspaceMembership.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.emailCodeChallenge.deleteMany(),
    prisma.authSession.deleteMany(),
    prisma.platformRoleAssignment.deleteMany(),
    prisma.user.deleteMany(),
    prisma.modelConfigVersion.deleteMany(),
    prisma.modelConfig.deleteMany(),
    prisma.modelProviderCredential.deleteMany(),
    prisma.modelProvider.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.industry.deleteMany(),
  ]);

  await prisma.permission.createMany({
    data: permissions.map(([code, description], index) => ({
      id: idFor(1, index + 1),
      code,
      description,
    })),
  });
  await prisma.role.createMany({
    data: roleCodes.map((code, index) => ({
      id: idFor(2, index + 1),
      code,
      scope: RoleScope.workspace,
      description: `测试工作区角色 ${code}`,
    })),
  });

  const permissionByCode = new Map<string, string>(
    permissions.map(([code], index) => [code, idFor(1, index + 1)]),
  );
  await prisma.rolePermission.createMany({
    data: roleCodes.flatMap((roleCode, roleIndex) =>
      rolePermissionCodes[roleCode]!.map((permissionCode, permissionIndex) => ({
        id: idFor(3 + roleIndex, permissionIndex + 1),
        roleId: idFor(2, roleIndex + 1),
        permissionId: permissionByCode.get(permissionCode)!,
      })),
    ),
  });

  await prisma.industry.createMany({
    data: [
      {
        id: idFor(10, 1),
        code: "test_retail",
        name: "测试零售",
        sortOrder: 10,
      },
      { id: idFor(10, 2), code: "test_food", name: "测试餐饮", sortOrder: 20 },
    ],
  });

  const providerId = idFor(20, 1);
  await prisma.modelProvider.create({
    data: {
      id: providerId,
      code: "volcengine_ark",
      name: "火山方舟（测试）",
      status: ConfigStatus.disabled,
    },
  });

  for (const [index, family] of Object.values(ModelFamily).entries()) {
    const configId = idFor(21, index + 1);
    await prisma.modelConfig.create({
      data: {
        id: configId,
        providerId,
        modelFamily: family,
        displayName: `${family} 测试配置`,
        status: ConfigStatus.disabled,
        versions: {
          create: {
            id: idFor(22, index + 1),
            versionNumber: 1,
            modelCode: `fixture-${family}`,
            apiMode: ApiMode.chat_completions,
            nativeWebSearch: false,
            capabilities: { fixture: true },
          },
        },
      },
    });
  }
}

try {
  await loadFixtures();
} finally {
  await prisma.$disconnect();
}
