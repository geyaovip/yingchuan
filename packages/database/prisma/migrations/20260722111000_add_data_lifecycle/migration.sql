CREATE TYPE "LegalHoldScopeType" AS ENUM ('workspace', 'project');
CREATE TYPE "DataLifecycleRunStatus" AS ENUM ('running', 'completed', 'failed', 'dead_letter');

ALTER TABLE "content_snapshots"
ADD COLUMN "content_purged_at" TIMESTAMPTZ(3);

ALTER TABLE "model_run_results"
ADD COLUMN "response_purged_at" TIMESTAMPTZ(3);

ALTER TABLE "agent_runs"
ADD COLUMN "conversation_purged_at" TIMESTAMPTZ(3);

CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL,
    "scope_type" "LegalHoldScopeType" NOT NULL,
    "scope_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "released_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),
    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_holds_scope_type_scope_id_active_idx"
ON "legal_holds"("scope_type", "scope_id", "active");

CREATE TABLE "data_lifecycle_runs" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "status" "DataLifecycleRunStatus" NOT NULL DEFAULT 'running',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "timeout_ms" INTEGER NOT NULL DEFAULT 300000,
    "cutoff_at" TIMESTAMPTZ(3) NOT NULL,
    "counts" JSONB NOT NULL,
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "data_lifecycle_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_lifecycle_runs_idempotency_key_key"
ON "data_lifecycle_runs"("idempotency_key");

CREATE INDEX "data_lifecycle_runs_status_updated_at_idx"
ON "data_lifecycle_runs"("status", "updated_at");
