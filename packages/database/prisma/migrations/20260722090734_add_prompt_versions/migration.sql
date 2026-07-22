-- CreateEnum
CREATE TYPE "PromptCategory" AS ENUM ('brand_awareness', 'recommendation', 'comparison', 'scenario', 'product_or_service', 'price', 'trust', 'location', 'nearby', 'store_specific', 'alternative', 'factual');

-- CreateEnum
CREATE TYPE "PromptScope" AS ENUM ('global', 'country', 'province', 'city', 'district', 'nearby', 'store');

-- CreateEnum
CREATE TYPE "PromptSource" AS ENUM ('manual', 'generated', 'imported', 'variant');

-- CreateTable
CREATE TABLE "prompts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "normalized_text" VARCHAR(1000) NOT NULL,
    "category" "PromptCategory" NOT NULL,
    "scope" "PromptScope" NOT NULL,
    "country" VARCHAR(2),
    "province" VARCHAR(100),
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "nearby_landmark" VARCHAR(200),
    "target_store_id" UUID,
    "language" VARCHAR(20) NOT NULL,
    "source" "PromptSource" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "group_key" VARCHAR(100),
    "created_by_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "prompt_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "normalized_text" VARCHAR(1000) NOT NULL,
    "category" "PromptCategory" NOT NULL,
    "scope" "PromptScope" NOT NULL,
    "country" VARCHAR(2),
    "province" VARCHAR(100),
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "nearby_landmark" VARCHAR(200),
    "target_store_id" UUID,
    "language" VARCHAR(20) NOT NULL,
    "source" "PromptSource" NOT NULL,
    "priority" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "group_key" VARCHAR(100),
    "change_reason" VARCHAR(100) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompts_project_id_enabled_category_idx" ON "prompts"("project_id", "enabled", "category");

-- CreateIndex
CREATE INDEX "prompts_project_id_group_key_idx" ON "prompts"("project_id", "group_key");

-- CreateIndex
CREATE UNIQUE INDEX "prompts_project_id_normalized_text_key" ON "prompts"("project_id", "normalized_text");

-- CreateIndex
CREATE INDEX "prompt_versions_created_by_id_created_at_idx" ON "prompt_versions"("created_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_prompt_id_version_number_key" ON "prompt_versions"("prompt_id", "version_number");

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
