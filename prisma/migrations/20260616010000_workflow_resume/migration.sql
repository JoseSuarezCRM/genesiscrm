-- Paused workflow executions waiting at a delay step
CREATE TABLE "WorkflowResume" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "resumeNodeId" TEXT NOT NULL,
    "resumeAt" TIMESTAMP(3) NOT NULL,
    "referralId" TEXT,
    "recordLabel" TEXT,
    "vars" JSONB NOT NULL,
    "record" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowResume_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowResume_resumeAt_idx" ON "WorkflowResume"("resumeAt");
CREATE INDEX "WorkflowResume_automationId_idx" ON "WorkflowResume"("automationId");

ALTER TABLE "WorkflowResume" ADD CONSTRAINT "WorkflowResume_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
