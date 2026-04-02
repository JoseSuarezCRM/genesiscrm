-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('NO_ANSWER', 'VOICEMAIL', 'ANSWERED');

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "notes" TEXT,
    "calledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallAttempt_referralId_idx" ON "CallAttempt"("referralId");

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
