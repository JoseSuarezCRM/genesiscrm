-- Add structured run metadata (record label + per-step outcomes)
ALTER TABLE "AutomationRun" ADD COLUMN "meta" JSONB;
