-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "OutreachTrigger" AS ENUM ('MANUAL', 'STATUS_SCHEDULED', 'STATUS_COMPLETED', 'REMINDER_24HR');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('SENT', 'FAILED');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'OUTREACH_SENT';

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "trigger" "OutreachTrigger" NOT NULL,
    "status" "OutreachStatus" NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachMessage_referralId_idx" ON "OutreachMessage"("referralId");

-- CreateIndex
CREATE INDEX "OutreachMessage_createdAt_idx" ON "OutreachMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
