-- Intermediate migration: add tags column (will be replaced by junction table in next migration)
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
