-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'identifying', 'waiting_confirmation', 'ready', 'active', 'archived');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('input_pending', 'identification_queued', 'identification_running', 'confirmation_required', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('user_input', 'official_website', 'model_native_search', 'manual');

-- CreateEnum
CREATE TYPE "AliasStatus" AS ENUM ('pending', 'confirmed', 'rejected');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('official_website', 'official_social', 'public_profile', 'model_reference', 'other');

-- CreateEnum
CREATE TYPE "KnowledgeSourceStatus" AS ENUM ('discovered', 'confirmed', 'rejected', 'unavailable', 'outdated', 'needs_review');

-- CreateEnum
CREATE TYPE "FetchJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'blocked');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "brand_entity_id" UUID,
    "industry_id" UUID,
    "default_country" VARCHAR(2) NOT NULL DEFAULT 'CN',
    "default_language" VARCHAR(20) NOT NULL DEFAULT 'zh-CN',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Shanghai',
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "onboarding_status" "OnboardingStatus" NOT NULL DEFAULT 'input_pending',
    "archived_from" "ProjectStatus",
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_entities" (
    "id" UUID NOT NULL,
    "canonical_name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "official_website" VARCHAR(2048),
    "country" VARCHAR(2),
    "primary_language" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "brand_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_aliases" (
    "id" UUID NOT NULL,
    "brand_entity_id" UUID NOT NULL,
    "value" VARCHAR(160) NOT NULL,
    "normalized_value" VARCHAR(160) NOT NULL,
    "language" VARCHAR(20),
    "source" "CandidateSource" NOT NULL,
    "status" "AliasStatus" NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "brand_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_entity_versions" (
    "id" UUID NOT NULL,
    "brand_entity_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "canonical_name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "official_website" VARCHAR(2048),
    "country" VARCHAR(2),
    "primary_language" VARCHAR(20),
    "change_reason" VARCHAR(100) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_entity_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identification_jobs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "FetchJobStatus" NOT NULL DEFAULT 'queued',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "timeout_ms" INTEGER NOT NULL DEFAULT 30000,
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "identification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_candidates" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "official_website" VARCHAR(2048),
    "country" VARCHAR(2),
    "confidence" DECIMAL(5,4) NOT NULL,
    "source" "CandidateSource" NOT NULL,
    "citation_url" VARCHAR(2048),
    "status" "CandidateStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "brand_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "KnowledgeSourceType" NOT NULL,
    "original_url" VARCHAR(2048) NOT NULL,
    "normalized_url" VARCHAR(2048) NOT NULL,
    "status" "KnowledgeSourceStatus" NOT NULL DEFAULT 'discovered',
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "last_fetched_at" TIMESTAMPTZ(3),
    "last_successful_fetched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_fetch_jobs" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "status" "FetchJobStatus" NOT NULL DEFAULT 'queued',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "max_bytes" INTEGER NOT NULL DEFAULT 5242880,
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "source_fetch_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_snapshots" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "previous_snapshot_id" UUID,
    "content_hash" CHAR(64) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "http_status" INTEGER NOT NULL,
    "final_url" VARCHAR(2048) NOT NULL,
    "extracted_text" TEXT,
    "text_storage_path" VARCHAR(1024),
    "structured_data" JSONB,
    "summary" TEXT,
    "diff_summary" JSONB,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "actor_id" UUID NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_brand_entity_id_key" ON "projects"("brand_entity_id");

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_created_at_idx" ON "projects"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "brand_entities_normalized_name_country_idx" ON "brand_entities"("normalized_name", "country");

-- CreateIndex
CREATE UNIQUE INDEX "brand_aliases_brand_entity_id_normalized_value_key" ON "brand_aliases"("brand_entity_id", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "brand_entity_versions_brand_entity_id_version_number_key" ON "brand_entity_versions"("brand_entity_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "identification_jobs_idempotency_key_key" ON "identification_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "identification_jobs_project_id_created_at_idx" ON "identification_jobs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "brand_candidates_project_id_status_idx" ON "brand_candidates"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "brand_candidates_project_id_normalized_name_official_websit_key" ON "brand_candidates"("project_id", "normalized_name", "official_website");

-- CreateIndex
CREATE INDEX "knowledge_sources_project_id_status_idx" ON "knowledge_sources"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_sources_project_id_normalized_url_key" ON "knowledge_sources"("project_id", "normalized_url");

-- CreateIndex
CREATE UNIQUE INDEX "source_fetch_jobs_idempotency_key_key" ON "source_fetch_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "source_fetch_jobs_source_id_created_at_idx" ON "source_fetch_jobs"("source_id", "created_at");

-- CreateIndex
CREATE INDEX "content_snapshots_source_id_fetched_at_idx" ON "content_snapshots"("source_id", "fetched_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_actor_id_key_key" ON "idempotency_records"("scope", "actor_id", "key");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_brand_entity_id_fkey" FOREIGN KEY ("brand_entity_id") REFERENCES "brand_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_aliases" ADD CONSTRAINT "brand_aliases_brand_entity_id_fkey" FOREIGN KEY ("brand_entity_id") REFERENCES "brand_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_entity_versions" ADD CONSTRAINT "brand_entity_versions_brand_entity_id_fkey" FOREIGN KEY ("brand_entity_id") REFERENCES "brand_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_entity_versions" ADD CONSTRAINT "brand_entity_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identification_jobs" ADD CONSTRAINT "identification_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_candidates" ADD CONSTRAINT "brand_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_fetch_jobs" ADD CONSTRAINT "source_fetch_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_previous_snapshot_id_fkey" FOREIGN KEY ("previous_snapshot_id") REFERENCES "content_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
