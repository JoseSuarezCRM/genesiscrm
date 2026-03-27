-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BroadcastRecipientType" AS ENUM ('PATIENT', 'PROVIDER');

-- CreateTable
CREATE TABLE "EmailBroadcast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BroadcastRecipientType" NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailBroadcast_status_idx" ON "EmailBroadcast"("status");

-- CreateIndex
CREATE INDEX "EmailBroadcast_scheduledAt_idx" ON "EmailBroadcast"("scheduledAt");

-- CreateIndex
CREATE INDEX "EmailBroadcastRecipient_broadcastId_idx" ON "EmailBroadcastRecipient"("broadcastId");

-- AddForeignKey
ALTER TABLE "EmailBroadcast" ADD CONSTRAINT "EmailBroadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailBroadcastRecipient" ADD CONSTRAINT "EmailBroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "EmailBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
