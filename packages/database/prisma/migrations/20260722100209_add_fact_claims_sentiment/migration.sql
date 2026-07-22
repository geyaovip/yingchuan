-- AlterTable
ALTER TABLE "run_parse_results" ADD COLUMN     "sentiment_label" VARCHAR(20) NOT NULL DEFAULT 'neutral',
ADD COLUMN     "sentiment_score" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "fact_claims" (
    "id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "claim_text" VARCHAR(1000) NOT NULL,
    "evidence_snippet" VARCHAR(1000) NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "accuracy_label" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fact_claims_model_run_id_idx" ON "fact_claims"("model_run_id");

-- AddForeignKey
ALTER TABLE "fact_claims" ADD CONSTRAINT "fact_claims_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "model_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
