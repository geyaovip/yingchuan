CREATE TYPE "OperationsDailyReportStatus" AS ENUM (
  'running',
  'completed',
  'failed',
  'dead_letter'
);

CREATE TABLE "operations_daily_reports" (
  "id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "report_date" DATE NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "status" "OperationsDailyReportStatus" NOT NULL DEFAULT 'running',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "window_start" TIMESTAMPTZ(3) NOT NULL,
  "window_end" TIMESTAMPTZ(3) NOT NULL,
  "snapshot" JSONB,
  "summary" TEXT,
  "error_code" VARCHAR(100),
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "operations_daily_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operations_daily_reports_idempotency_key_key"
  ON "operations_daily_reports"("idempotency_key");

CREATE INDEX "operations_daily_reports_status_updated_at_idx"
  ON "operations_daily_reports"("status", "updated_at");

CREATE INDEX "operations_daily_reports_report_date_idx"
  ON "operations_daily_reports"("report_date");
