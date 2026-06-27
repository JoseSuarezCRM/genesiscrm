-- Audit columns for message templates (updated-by, last-viewed-by)
ALTER TABLE "MessageTemplate" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN "lastViewedById" TEXT;
ALTER TABLE "MessageTemplate" ADD COLUMN "lastViewedAt" TIMESTAMP(3);
