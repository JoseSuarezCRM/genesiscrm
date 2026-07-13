-- Object-agnostic automation triggers + generic record actions
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'RECORD_CREATED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'RECORD_PROPERTY_CHANGED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'RECORD_OWNER_CHANGED';

ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'SET_PROPERTY';
ALTER TYPE "AutomationAction" ADD VALUE IF NOT EXISTS 'ASSIGN_OWNER';

-- A paused workflow needs to remember which record it was acting on.
ALTER TABLE "WorkflowResume" ADD COLUMN IF NOT EXISTS "recordType" TEXT;
ALTER TABLE "WorkflowResume" ADD COLUMN IF NOT EXISTS "recordId" TEXT;
