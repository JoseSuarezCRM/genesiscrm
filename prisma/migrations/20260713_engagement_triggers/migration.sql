-- Engagement triggers: inbound SMS, logged engagements, overdue tasks
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'SMS_RECEIVED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'ENGAGEMENT_LOGGED';
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'TASK_OVERDUE';
