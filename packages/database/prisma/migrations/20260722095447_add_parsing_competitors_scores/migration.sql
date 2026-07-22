-- CreateEnum
CREATE TYPE "MentionKind" AS ENUM ('target', 'competitor', 'other');

-- CreateEnum
CREATE TYPE "CompetitorStatus" AS ENUM ('candidate', 'confirmed', 'excluded');

-- CreateEnum
CREATE TYPE "ReviewIssueStatus" AS ENUM ('open', 'resolved', 'ignored');

-- CreateTable
CREATE TABLE "run_parse_results" (
    "id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "parser_version" VARCHAR(50) NOT NULL,
    "valid_sample" BOOLEAN NOT NULL,
    "refused" BOOLEAN NOT NULL DEFAULT false,
    "average_confidence" DECIMAL(5,2) NOT NULL,
    "parsed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_parse_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_mentions" (
    "id" UUID NOT NULL,
    "model_run_id" UUID NOT NULL,
    "raw_name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "kind" "MentionKind" NOT NULL,
    "competitor_id" UUID,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "rank_inferred" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DECIMAL(5,2) NOT NULL,
    "evidence_snippet" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_review_issues" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "model_run_id" UUID,
    "issue_type" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "confidence" DECIMAL(5,2),
    "status" "ReviewIssueStatus" NOT NULL DEFAULT 'open',
    "resolution_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "entity_review_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "canonical_name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "status" "CompetitorStatus" NOT NULL DEFAULT 'candidate',
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "excluded_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_aliases" (
    "id" UUID NOT NULL,
    "competitor_id" UUID NOT NULL,
    "alias" VARCHAR(200) NOT NULL,
    "normalized_alias" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_scores" (
    "id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "score_version" VARCHAR(50) NOT NULL,
    "parser_version" VARCHAR(50) NOT NULL,
    "overall_score" DECIMAL(6,2) NOT NULL,
    "confidence" DECIMAL(6,2) NOT NULL,
    "confidence_level" VARCHAR(20) NOT NULL,
    "diagnostic_only" BOOLEAN NOT NULL DEFAULT false,
    "valid_sample_count" INTEGER NOT NULL,
    "planned_run_count" INTEGER NOT NULL,
    "valid_model_count" INTEGER NOT NULL,
    "valid_prompt_count" INTEGER NOT NULL,
    "comparability_hash" CHAR(64) NOT NULL,
    "calculated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visibility_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_dimension_scores" (
    "id" UUID NOT NULL,
    "visibility_score_id" UUID NOT NULL,
    "dimension_code" VARCHAR(50) NOT NULL,
    "value" DECIMAL(6,2),
    "original_weight" DECIMAL(6,5) NOT NULL,
    "effective_weight" DECIMAL(6,5) NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "confidence" DECIMAL(6,2) NOT NULL,
    "missing_reason" VARCHAR(200),

    CONSTRAINT "visibility_dimension_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "run_parse_results_model_run_id_key" ON "run_parse_results"("model_run_id");

-- CreateIndex
CREATE INDEX "entity_mentions_model_run_id_kind_idx" ON "entity_mentions"("model_run_id", "kind");

-- CreateIndex
CREATE INDEX "entity_mentions_competitor_id_idx" ON "entity_mentions"("competitor_id");

-- CreateIndex
CREATE INDEX "entity_review_issues_project_id_status_idx" ON "entity_review_issues"("project_id", "status");

-- CreateIndex
CREATE INDEX "competitors_project_id_status_idx" ON "competitors"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_project_id_normalized_name_key" ON "competitors"("project_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "competitor_aliases_competitor_id_normalized_alias_key" ON "competitor_aliases"("competitor_id", "normalized_alias");

-- CreateIndex
CREATE INDEX "visibility_scores_calculated_at_idx" ON "visibility_scores"("calculated_at");

-- CreateIndex
CREATE UNIQUE INDEX "visibility_scores_analysis_job_id_score_version_key" ON "visibility_scores"("analysis_job_id", "score_version");

-- CreateIndex
CREATE UNIQUE INDEX "visibility_dimension_scores_visibility_score_id_dimension_c_key" ON "visibility_dimension_scores"("visibility_score_id", "dimension_code");

-- AddForeignKey
ALTER TABLE "run_parse_results" ADD CONSTRAINT "run_parse_results_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "model_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_mentions" ADD CONSTRAINT "entity_mentions_model_run_id_fkey" FOREIGN KEY ("model_run_id") REFERENCES "model_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_mentions" ADD CONSTRAINT "entity_mentions_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_aliases" ADD CONSTRAINT "competitor_aliases_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_dimension_scores" ADD CONSTRAINT "visibility_dimension_scores_visibility_score_id_fkey" FOREIGN KEY ("visibility_score_id") REFERENCES "visibility_scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
