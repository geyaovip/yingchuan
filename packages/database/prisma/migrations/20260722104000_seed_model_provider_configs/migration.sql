-- Seed disabled configuration identities only. No provider credential or real Model ID is stored here.
INSERT INTO "model_providers" ("id", "code", "name", "status", "updated_at")
VALUES (
  '019f87ef-0014-7000-8000-000000000001',
  'volcengine_ark',
  '火山方舟',
  'disabled',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "model_configs" (
  "id", "provider_id", "model_family", "display_name", "status", "is_fallback", "updated_at"
)
SELECT seed.id::uuid, provider.id, seed.family::"ModelFamily", seed.name, 'disabled', seed.is_fallback, CURRENT_TIMESTAMP
FROM "model_providers" provider
CROSS JOIN (VALUES
  ('019f87ef-0015-7000-8000-000000000001', 'doubao', '豆包（待配置）', true),
  ('019f87ef-0015-7000-8000-000000000002', 'kimi', 'Kimi（待配置）', false),
  ('019f87ef-0015-7000-8000-000000000003', 'glm', 'GLM（待配置）', false),
  ('019f87ef-0015-7000-8000-000000000004', 'deepseek', 'DeepSeek（待配置）', false)
) AS seed(id, family, name, is_fallback)
WHERE provider.code = 'volcengine_ark'
ON CONFLICT ("provider_id", "model_family") DO NOTHING;

INSERT INTO "model_config_versions" (
  "id", "model_config_id", "version_number", "model_code", "api_mode", "native_web_search", "capabilities"
)
SELECT seed.id::uuid, config.id, 1, seed.model_code, 'chat_completions', false, '{"configured":false}'::jsonb
FROM "model_configs" config
JOIN "model_providers" provider ON provider.id = config.provider_id
JOIN (VALUES
  ('019f87ef-0016-7000-8000-000000000001', 'doubao', 'configure-in-admin-doubao'),
  ('019f87ef-0016-7000-8000-000000000002', 'kimi', 'configure-in-admin-kimi'),
  ('019f87ef-0016-7000-8000-000000000003', 'glm', 'configure-in-admin-glm'),
  ('019f87ef-0016-7000-8000-000000000004', 'deepseek', 'configure-in-admin-deepseek')
) AS seed(id, family, model_code) ON seed.family::"ModelFamily" = config.model_family
WHERE provider.code = 'volcengine_ark'
ON CONFLICT ("model_config_id", "version_number") DO NOTHING;
