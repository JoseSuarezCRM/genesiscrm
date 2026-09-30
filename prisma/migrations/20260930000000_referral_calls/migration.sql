-- The on-call referral-call intake.
--
-- Audit actions for custom-object records and for AI readings of call notes.
-- IF NOT EXISTS because local development runs against the production database
-- with `prisma db push`, which will already have added these values by the time
-- `prisma migrate deploy` runs this file on Vercel.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECORD_CREATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RECORD_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AI_EXTRACTION';

-- Saved AI rules ("what to pull and where"), one row per object key.
CREATE TABLE IF NOT EXISTS "ExtractionProfile" (
    "objectKey" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "fields" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtractionProfile_pkey" PRIMARY KEY ("objectKey")
);
