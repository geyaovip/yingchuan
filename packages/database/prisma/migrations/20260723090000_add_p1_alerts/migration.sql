CREATE TYPE "AlertStatus" AS ENUM ('active', 'resolved');
CREATE TYPE "AlertEvaluationRunStatus" AS ENUM ('running', 'completed', 'failed', 'dead_letter');

ALTER TABLE "notification_deliveries"
ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3);

CREATE TABLE "alert_events" (
    "id" UUID NOT NULL,
    "rule_code" VARCHAR(80) NOT NULL,
    "fingerprint" VARCHAR(200) NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'active',
    "severity" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "metric_value" DECIMAL(20,6) NOT NULL,
    "threshold_value" DECIMAL(20,6) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "context" JSONB NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "first_triggered_at" TIMESTAMPTZ(3) NOT NULL,
    "last_triggered_at" TIMESTAMPTZ(3) NOT NULL,
    "last_notified_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_evaluation_runs" (
    "id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "status" "AlertEvaluationRunStatus" NOT NULL DEFAULT 'running',
    "reference_time" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "evaluated_rule_count" INTEGER NOT NULL DEFAULT 0,
    "opened_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(100),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "alert_evaluation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alert_events_active_fingerprint_key"
ON "alert_events"("fingerprint")
WHERE "status" = 'active';
CREATE INDEX "alert_events_status_updated_at_idx"
ON "alert_events"("status", "updated_at");
CREATE INDEX "alert_events_rule_code_first_triggered_at_idx"
ON "alert_events"("rule_code", "first_triggered_at");
CREATE UNIQUE INDEX "alert_evaluation_runs_idempotency_key_key"
ON "alert_evaluation_runs"("idempotency_key");
CREATE INDEX "alert_evaluation_runs_status_updated_at_idx"
ON "alert_evaluation_runs"("status", "updated_at");
