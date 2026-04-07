-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('REFERRAL_CREATED', 'REFERRAL_STATUS_CHANGED', 'PROVIDER_REFERRAL_COUNT', 'PRACTICE_REFERRAL_COUNT', 'REFERRAL_NO_ACTIVITY', 'APPOINTMENT_UPCOMING', 'CALL_ATTEMPTS_REACHED', 'REFERRAL_ASSIGNED');

-- CreateEnum
CREATE TYPE "AutomationAction" AS ENUM ('CREATE_TASK', 'SEND_NOTIFICATION', 'UPDATE_REFERRAL_STATUS', 'ASSIGN_REFERRAL', 'ADD_TAG');

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "actionType" "AutomationAction" NOT NULL,
    "actionConfig" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contextType" TEXT NOT NULL,
    "contextId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Automation_triggerType_isActive_idx" ON "Automation"("triggerType", "isActive");

-- CreateIndex
CREATE INDEX "AutomationRun_automationId_idx" ON "AutomationRun"("automationId");

-- CreateIndex
CREATE INDEX "AutomationRun_contextType_contextId_idx" ON "AutomationRun"("contextType", "contextId");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
