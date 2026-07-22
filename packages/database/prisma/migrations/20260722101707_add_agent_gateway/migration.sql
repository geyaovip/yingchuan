-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'budget_exceeded');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('proposed', 'executed', 'rejected', 'failed');

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID,
    "project_id" UUID,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "runtime_version" VARCHAR(50) NOT NULL,
    "question" VARCHAR(2000) NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "allowed_skills" JSONB NOT NULL,
    "token_budget" INTEGER NOT NULL,
    "cost_budget_micros" BIGINT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "answer" TEXT,
    "citations" JSONB NOT NULL,
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL,
    "agent_run_id" UUID NOT NULL,
    "skill_name" VARCHAR(100) NOT NULL,
    "skill_version" INTEGER NOT NULL,
    "risk_level" VARCHAR(20) NOT NULL,
    "status" "AgentActionStatus" NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "output_snapshot" JSONB,
    "idempotency_key" VARCHAR(200),
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_todos" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_by_id" UUID NOT NULL,
    "agent_run_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_runs_user_id_created_at_idx" ON "agent_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_workspace_id_created_at_idx" ON "agent_runs"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_actions_idempotency_key_key" ON "agent_actions"("idempotency_key");

-- CreateIndex
CREATE INDEX "agent_actions_agent_run_id_created_at_idx" ON "agent_actions"("agent_run_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_todos_status_created_at_idx" ON "admin_todos"("status", "created_at");

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
