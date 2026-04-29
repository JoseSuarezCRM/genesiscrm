-- AlterEnum: add EMBED_REFERRAL_RECEIVED to AutomationTrigger
-- NOTE: ADD VALUE cannot run inside a transaction in PostgreSQL
ALTER TYPE "AutomationTrigger" ADD VALUE 'EMBED_REFERRAL_RECEIVED';
