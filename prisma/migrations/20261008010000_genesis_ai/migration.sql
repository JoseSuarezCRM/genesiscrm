-- Genesis AI (the top-bar assistant): its audit action and its chats.
-- IF NOT EXISTS because local development runs against the production database
-- with `prisma db push`, which will already have applied these by the time
-- `prisma migrate deploy` runs this file on Vercel.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AI_ASSISTANT';

CREATE TABLE IF NOT EXISTS "AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiConversation_updatedAt_idx" ON "AiConversation"("updatedAt");

CREATE TABLE IF NOT EXISTS "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
