-- CreateTable: Pipeline
CREATE TABLE "Pipeline" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "color"     TEXT NOT NULL DEFAULT '#3b82f6',
    "order"     INTEGER NOT NULL DEFAULT 0,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pipeline_name_key" ON "Pipeline"("name");

-- AlterTable: add pipelineId to Referral
ALTER TABLE "Referral" ADD COLUMN "pipelineId" TEXT;

-- Seed: create the default Clinical pipeline and assign all existing referrals to it
INSERT INTO "Pipeline" ("id", "name", "color", "order", "createdAt")
VALUES ('pipeline_clinical', 'Clinical', '#3b82f6', 0, NOW());

UPDATE "Referral" SET "pipelineId" = 'pipeline_clinical';

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_pipelineId_fkey"
    FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
