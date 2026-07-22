-- CreateEnum
CREATE TYPE "ModelCallStatus" AS ENUM ('succeeded', 'failed');

-- CreateEnum
CREATE TYPE "UsageEntryType" AS ENUM ('grant', 'reservation', 'release', 'debit', 'adjustment');

-- AlterTable
ALTER TABLE "model_configs" ADD COLUMN     "is_fallback" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prompt_versions" ADD COLUMN     "requires_web_search" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prompts" ADD COLUMN     "requires_web_search" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "model_provider_credentials" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "initialization_vector" VARCHAR(50) NOT NULL,
    "auth_tag" VARCHAR(50) NOT NULL,
    "key_version" VARCHAR(50) NOT NULL,
    "masked_hint" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(3),

    CONSTRAINT "model_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_call_logs" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "model_config_version_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "request_id" VARCHAR(150) NOT NULL,
    "provider_request_id" VARCHAR(150),
    "status" "ModelCallStatus" NOT NULL,
    "native_web_search_enabled" BOOLEAN NOT NULL DEFAULT false,
    "web_search_tool_version" VARCHAR(100),
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "web_search_cost_micros" BIGINT NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_category" VARCHAR(100),
    "error_code" VARCHAR(100),
    "request_hash" CHAR(64) NOT NULL,
    "response_hash" CHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger_entries" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID,
    "project_id" UUID,
    "entry_type" "UsageEntryType" NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "quantity_micros" BIGINT NOT NULL,
    "unit_cost_micros" BIGINT NOT NULL DEFAULT 1,
    "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
    "source" VARCHAR(100) NOT NULL,
    "related_job_id" UUID,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_provider_credentials_provider_id_retired_at_created_a_idx" ON "model_provider_credentials"("provider_id", "retired_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_call_logs_request_id_key" ON "model_call_logs"("request_id");

-- CreateIndex
CREATE INDEX "model_call_logs_workspace_id_created_at_idx" ON "model_call_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "model_call_logs_model_config_version_id_created_at_idx" ON "model_call_logs"("model_config_version_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledger_entries_idempotency_key_key" ON "usage_ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_workspace_id_resource_type_created_at_idx" ON "usage_ledger_entries"("workspace_id", "resource_type", "created_at");

-- CreateIndex
CREATE INDEX "usage_ledger_entries_project_id_created_at_idx" ON "usage_ledger_entries"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "model_provider_credentials" ADD CONSTRAINT "model_provider_credentials_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_call_logs" ADD CONSTRAINT "model_call_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_call_logs" ADD CONSTRAINT "model_call_logs_model_config_version_id_fkey" FOREIGN KEY ("model_config_version_id") REFERENCES "model_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger_entries" ADD CONSTRAINT "usage_ledger_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
