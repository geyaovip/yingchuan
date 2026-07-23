ALTER TABLE "alert_events"
ADD COLUMN "acknowledged_at" TIMESTAMPTZ(3),
ADD COLUMN "acknowledged_by_id" UUID;

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_acknowledged_by_id_fkey"
FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
