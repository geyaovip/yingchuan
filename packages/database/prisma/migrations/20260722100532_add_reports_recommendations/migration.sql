-- CreateEnum
CREATE TYPE "ReportVersionStatus" AS ENUM ('generating', 'ready', 'published', 'archived', 'failed');

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_versions" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "visibility_score_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ReportVersionStatus" NOT NULL DEFAULT 'generating',
    "title" VARCHAR(200) NOT NULL,
    "content_snapshot" JSONB NOT NULL,
    "limitation_summary" VARCHAR(1000),
    "generated_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_recommendations" (
    "id" UUID NOT NULL,
    "report_version_id" UUID NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "priority" "RecommendationPriority" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1500) NOT NULL,
    "impact" VARCHAR(500) NOT NULL,
    "effort" VARCHAR(100) NOT NULL,
    "evidence" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optimization_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_view_events" (
    "id" UUID NOT NULL,
    "report_version_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "request_id" VARCHAR(100) NOT NULL,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_view_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_project_id_key" ON "reports"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_visibility_score_id_key" ON "report_versions"("visibility_score_id");

-- CreateIndex
CREATE INDEX "report_versions_report_id_status_created_at_idx" ON "report_versions"("report_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_report_id_version_number_key" ON "report_versions"("report_id", "version_number");

-- CreateIndex
CREATE INDEX "optimization_recommendations_report_version_id_priority_sor_idx" ON "optimization_recommendations"("report_version_id", "priority", "sort_order");

-- CreateIndex
CREATE INDEX "report_view_events_report_version_id_viewed_at_idx" ON "report_view_events"("report_version_id", "viewed_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_visibility_score_id_fkey" FOREIGN KEY ("visibility_score_id") REFERENCES "visibility_scores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_report_version_id_fkey" FOREIGN KEY ("report_version_id") REFERENCES "report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_view_events" ADD CONSTRAINT "report_view_events_report_version_id_fkey" FOREIGN KEY ("report_version_id") REFERENCES "report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
