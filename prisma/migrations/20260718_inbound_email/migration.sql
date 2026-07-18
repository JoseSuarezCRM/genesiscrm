ALTER TABLE "DirectEmail" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'OUTBOUND';
ALTER TABLE "DirectEmail" ADD COLUMN IF NOT EXISTS "fromEmail" TEXT;
ALTER TABLE "DirectEmail" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;
ALTER TABLE "DirectEmail" ADD COLUMN IF NOT EXISTS "internetMessageId" TEXT;
ALTER TABLE "DirectEmail" ALTER COLUMN "sentById" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "DirectEmail_internetMessageId_key" ON "DirectEmail"("internetMessageId");
CREATE INDEX IF NOT EXISTS "DirectEmail_conversationId_idx" ON "DirectEmail"("conversationId");
CREATE INDEX IF NOT EXISTS "DirectEmail_fromEmail_idx" ON "DirectEmail"("fromEmail");
