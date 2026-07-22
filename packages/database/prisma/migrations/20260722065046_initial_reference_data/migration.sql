-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('workspace', 'platform');

-- CreateEnum
CREATE TYPE "ModelFamily" AS ENUM ('doubao', 'kimi', 'glm', 'deepseek');

-- CreateEnum
CREATE TYPE "ApiMode" AS ENUM ('responses', 'chat_completions');

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('disabled', 'enabled');

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industries" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_providers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" "ConfigStatus" NOT NULL DEFAULT 'disabled',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "model_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_configs" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "model_family" "ModelFamily" NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "status" "ConfigStatus" NOT NULL DEFAULT 'disabled',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_config_versions" (
    "id" UUID NOT NULL,
    "model_config_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "model_code" VARCHAR(150) NOT NULL,
    "endpoint_id" VARCHAR(150),
    "api_mode" "ApiMode" NOT NULL,
    "native_web_search" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB NOT NULL,
    "web_search_config" JSONB,
    "context_window" INTEGER,
    "input_price_micros_per_million" BIGINT,
    "output_price_micros_per_million" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'CNY',
    "max_concurrency" INTEGER NOT NULL DEFAULT 1,
    "timeout_ms" INTEGER NOT NULL DEFAULT 60000,
    "probed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_scope_code_key" ON "roles"("scope", "code");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "industries_code_key" ON "industries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "model_providers_code_key" ON "model_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "model_configs_provider_id_model_family_key" ON "model_configs"("provider_id", "model_family");

-- CreateIndex
CREATE UNIQUE INDEX "model_config_versions_model_config_id_version_number_key" ON "model_config_versions"("model_config_id", "version_number");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "model_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_config_versions" ADD CONSTRAINT "model_config_versions_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
