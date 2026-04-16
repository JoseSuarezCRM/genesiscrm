-- AlterTable: add tags column to Activity
ALTER TABLE "Activity" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
