-- CreateEnum
CREATE TYPE "MonitoringFrequency" AS ENUM ('daily', 'weekly');

-- CreateEnum
CREATE TYPE "MonitoringExecutionStatus" AS ENUM ('pending', 'running', 'submitted', 'skipped', 'dead_letter');

-- CreateEnum
CREATE TYPE "OptimizationTaskStatus" AS ENUM ('open', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "monitoring_schedules" (
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "MonitoringFrequency" NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(100) NOT NULL,
    "prompt_ids" UUID[],
    "model_config_ids" UUID[],
    "max_cost_micros" BIGINT NOT NULL,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "monitoring_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_executions" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "MonitoringExecutionStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMPTZ(3),
    "retry_at" TIMESTAMPTZ(3),
    "error_code" VARCHAR(100),
    "analysis_job_id" UUID,
    "prompt_ids" UUID[],
    "model_config_ids" UUID[],
    "max_cost_micros" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "monitoring_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "assignee_id" UUID,
    "baseline_job_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "evidence_url" VARCHAR(2000),
    "status" "OptimizationTaskStatus" NOT NULL DEFAULT 'open',
    "due_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "optimization_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_retests" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optimization_retests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitoring_schedules_active_next_run_at_idx" ON "monitoring_schedules"("active", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_executions_analysis_job_id_key" ON "monitoring_executions"("analysis_job_id");

-- CreateIndex
CREATE INDEX "monitoring_executions_status_lease_until_retry_at_idx" ON "monitoring_executions"("status", "lease_until", "retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_executions_schedule_id_due_at_key" ON "monitoring_executions"("schedule_id", "due_at");

-- CreateIndex
CREATE INDEX "optimization_tasks_project_id_status_created_at_idx" ON "optimization_tasks"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "optimization_retests_analysis_job_id_key" ON "optimization_retests"("analysis_job_id");

-- CreateIndex
CREATE INDEX "optimization_retests_task_id_created_at_idx" ON "optimization_retests"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "monitoring_schedules" ADD CONSTRAINT "monitoring_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_schedules" ADD CONSTRAINT "monitoring_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_executions" ADD CONSTRAINT "monitoring_executions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "monitoring_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_executions" ADD CONSTRAINT "monitoring_executions_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_tasks" ADD CONSTRAINT "optimization_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_tasks" ADD CONSTRAINT "optimization_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_tasks" ADD CONSTRAINT "optimization_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_tasks" ADD CONSTRAINT "optimization_tasks_baseline_job_id_fkey" FOREIGN KEY ("baseline_job_id") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_retests" ADD CONSTRAINT "optimization_retests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "optimization_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_retests" ADD CONSTRAINT "optimization_retests_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Core configuration and retry invariants are also enforced in the database.
ALTER TABLE "monitoring_schedules"
  ALTER COLUMN "prompt_ids" SET NOT NULL,
  ALTER COLUMN "model_config_ids" SET NOT NULL,
  ADD CONSTRAINT "monitoring_schedule_clock_check" CHECK ("hour" BETWEEN 0 AND 23 AND "minute" BETWEEN 0 AND 59 AND "weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "monitoring_schedule_budget_check" CHECK ("max_cost_micros" > 0 AND "max_cost_micros" <= 10000000000),
  ADD CONSTRAINT "monitoring_schedule_selection_check" CHECK (cardinality("prompt_ids") BETWEEN 1 AND 200 AND cardinality("model_config_ids") BETWEEN 1 AND 20);
ALTER TABLE "monitoring_executions"
  ALTER COLUMN "prompt_ids" SET NOT NULL,
  ALTER COLUMN "model_config_ids" SET NOT NULL,
  ADD CONSTRAINT "monitoring_execution_attempt_check" CHECK ("attempts" BETWEEN 0 AND 3),
  ADD CONSTRAINT "monitoring_execution_budget_check" CHECK ("max_cost_micros" > 0);

CREATE UNIQUE INDEX "monitoring_schedules_idempotency_key_key" ON "monitoring_schedules"("idempotency_key");
