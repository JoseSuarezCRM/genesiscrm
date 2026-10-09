-- Genesis AI actions: changes it proposes, which run only when their owner confirms.
-- IF NOT EXISTS because local development runs against the production database
-- with `prisma db push`, which will already have applied these by the time
-- `prisma migrate deploy` runs this file on Vercel.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AI_ACTION';

CREATE TABLE IF NOT EXISTS "AiPendingAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "toolUseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "card" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "AiPendingAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiPendingAction_conversationId_idx" ON "AiPendingAction"("conversationId");
CREATE INDEX IF NOT EXISTS "AiPendingAction_userId_status_idx" ON "AiPendingAction"("userId", "status");

DO $$ BEGIN
    ALTER TABLE "AiPendingAction" ADD CONSTRAINT "AiPendingAction_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
