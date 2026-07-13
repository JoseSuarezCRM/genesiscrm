-- RecordNote becomes a general engagement log (notes, call logs, meetings)
ALTER TABLE "RecordNote" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'NOTE';
ALTER TABLE "RecordNote" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "RecordNote" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3);
ALTER TABLE "RecordNote" ADD COLUMN IF NOT EXISTS "meta" JSONB;
