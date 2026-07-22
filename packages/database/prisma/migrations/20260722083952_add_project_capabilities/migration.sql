-- CreateTable
CREATE TABLE "project_capabilities" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_capabilities_project_id_code_key" ON "project_capabilities"("project_id", "code");

-- AddForeignKey
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
