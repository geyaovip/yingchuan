-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('queued', 'running', 'completed', 'partially_completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ModelRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown');

-- CreateEnum
CREATE TYPE "RunAttemptStatus" AS ENUM ('running', 'succeeded', 'failed', 'outcome_unknown');

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'queued',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "total_runs" INTEGER NOT NULL,
    "queued_runs" INTEGER NOT NULL,
    "running_runs" INTEGER NOT NULL DEFAULT 0,
    "succeeded_runs" INTEGER NOT NULL DEFAULT 0,
    "failed_runs" INTEGER NOT NULL DEFAULT 0,
    "cancelled_runs" INTEGER NOT NULL DEFAULT 0,
    "skipped_runs" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_micros" BIGINT NOT NULL,
    "reserved_ledger_entry_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
    "estimate_snapshot" JSONB NOT NULL,
    "error_summary" JSONB,
    "cancellation_requested_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancellation_reason" VARCHAR(500),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_runs" (
    "id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "prompt_version_id" UUID NOT NULL,
    "model_config_version_id" UUID NOT NULL,
    "scope_hash" CHAR(64) NOT NULL,
    "scope_snapshot" JSONB NOT NULL,
    "sample_index" INTEGER NOT NULL DEFAULT 0,
    "status" "ModelRunStatus" NOT NULL DEFAULT 'queued',
    "prompt_text_snapshot" VARCHAR(1000) NOT NULL,
    "model_code_snapshot" VARCHAR(150) NOT NULL,
    "api_mode_snapshot" "ApiMode" NOT NULL,
    "native_web_search_enabled" BOOLEAN NOT NULL DEFAULT false,
    "web_search_config_snapshot" JSONB,
    "web_search_tool_version" VARCHAR(100),
    "input_price_micros_per_million" BIGINT,
    "output_price_micros_per_million" BIGINT,
    "estimated_cost_micros" BIGINT NOT NULL,
    "provider_request_id" VARCHAR(150),
    "error_category" VARCHAR(100),
    "error_code" VARCHAR(100),
    "retryable" BOOLEAN,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "model_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_attempts" (
    "id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "RunAttemptStatus" NOT NULL,
    "gateway_retry_count" INTEGER NOT NULL DEFAULT 0,
    "provider_request_id" VARCHAR(150),
    "error_category" VARCHAR(100),
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "run_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_run_results" (
    "id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "response_text" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_micros" BIGINT NOT NULL,
    "response_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_run_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_idempotency_key_key" ON "analysis_jobs"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_reserved_ledger_entry_id_key" ON "analysis_jobs"("reserved_ledger_entry_id");

-- CreateIndex
CREATE INDEX "analysis_jobs_project_id_created_at_idx" ON "analysis_jobs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_jobs_workspace_id_status_created_at_idx" ON "analysis_jobs"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "model_runs_analysis_job_id_status_idx" ON "model_runs"("analysis_job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "model_runs_analysis_job_id_prompt_version_id_model_config_v_key" ON "model_runs"("analysis_job_id", "prompt_version_id", "model_config_version_id", "scope_hash", "sample_index");

-- CreateIndex
CREATE UNIQUE INDEX "run_attempts_model_run_id_attempt_number_key" ON "run_attempts"("model_run_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "model_run_results_model_run_id_key" ON "model_run_results"("model_run_id");

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_model_config_version_id_fkey" FOREIGN KEY ("model_config_version_id") REFERENCES "model_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_attempts" ADD CONSTRAINT "run_attempts_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "model_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_run_results" ADD CONSTRAINT "model_run_results_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "model_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
