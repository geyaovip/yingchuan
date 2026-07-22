-- Stable P0 authorization reference data. Application data is never seeded here.
INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('019f87ef-1001-7000-8000-000000000001', 'workspace.settings.manage', '管理工作区设置'),
  ('019f87ef-1001-7000-8000-000000000002', 'workspace.delete', '删除工作区'),
  ('019f87ef-1001-7000-8000-000000000003', 'member.manage', '管理成员与角色'),
  ('019f87ef-1001-7000-8000-000000000004', 'project.manage', '创建和编辑项目'),
  ('019f87ef-1001-7000-8000-000000000005', 'analysis.run', '发起分析'),
  ('019f87ef-1001-7000-8000-000000000006', 'source.manage', '维护认知源'),
  ('019f87ef-1001-7000-8000-000000000007', 'store.manage', '维护门店'),
  ('019f87ef-1001-7000-8000-000000000008', 'report.view', '查看报告'),
  ('019f87ef-1001-7000-8000-000000000009', 'optimization.manage', '管理优化任务'),
  ('019f87ef-1001-7000-8000-00000000000a', 'usage.view', '查看用量')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "roles" ("id", "code", "scope", "description", "updated_at") VALUES
  ('019f87ef-1002-7000-8000-000000000001', 'owner', 'workspace', '工作区所有者', CURRENT_TIMESTAMP),
  ('019f87ef-1002-7000-8000-000000000002', 'admin', 'workspace', '工作区管理员', CURRENT_TIMESTAMP),
  ('019f87ef-1002-7000-8000-000000000003', 'analyst', 'workspace', '分析人员', CURRENT_TIMESTAMP),
  ('019f87ef-1002-7000-8000-000000000004', 'operator', 'workspace', '运营人员', CURRENT_TIMESTAMP),
  ('019f87ef-1002-7000-8000-000000000005', 'viewer', 'workspace', '只读成员', CURRENT_TIMESTAMP),
  ('019f87ef-1002-7000-8000-000000000006', 'super_admin', 'platform', '平台超级管理员', CURRENT_TIMESTAMP)
ON CONFLICT ("scope", "code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id")
SELECT gen_random_uuid(), r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."scope" = 'workspace'
  AND (
    r."code" = 'owner'
    OR (r."code" = 'admin' AND p."code" NOT IN ('workspace.settings.manage', 'workspace.delete'))
    OR (r."code" = 'analyst' AND p."code" IN ('project.manage', 'analysis.run', 'source.manage', 'store.manage', 'report.view', 'optimization.manage', 'usage.view'))
    OR (r."code" = 'operator' AND p."code" IN ('source.manage', 'store.manage', 'report.view', 'optimization.manage'))
    OR (r."code" = 'viewer' AND p."code" = 'report.view')
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
