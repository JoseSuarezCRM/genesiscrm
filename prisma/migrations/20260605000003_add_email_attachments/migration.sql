ALTER TABLE "EmailBroadcast" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "SequenceStep" ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]';
