-- CreateEnum
CREATE TYPE "SurgeryStatus" AS ENUM ('NEW', 'SCHEDULED', 'PENDING_CONFIRMATION', 'PENDING_CLEARANCE', 'CANCELED', 'COMPLETED');

-- CreateTable
CREATE TABLE "SurgeryCase" (
    "id" TEXT NOT NULL,
    "mrn" TEXT,
    "expires" TIMESTAMP(3),
    "creationDate" TIMESTAMP(3),
    "status" "SurgeryStatus" NOT NULL DEFAULT 'NEW',
    "patientName" TEXT NOT NULL,
    "diagnosis" TEXT,
    "clearanceRequired" TEXT,
    "ctRequired" TEXT,
    "glp1" TEXT,
    "facility" TEXT,
    "procedure" TEXT,
    "surgeryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SurgeryCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryCallAttempt" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "calledById" TEXT,
    "outcome" "CallOutcome" NOT NULL DEFAULT 'NO_ANSWER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurgeryCallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurgeryDocument" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "contentType" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurgeryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurgeryCallAttempt_caseId_idx" ON "SurgeryCallAttempt"("caseId");
CREATE INDEX "SurgeryDocument_caseId_idx" ON "SurgeryDocument"("caseId");

-- AddForeignKey
ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryCallAttempt" ADD CONSTRAINT "SurgeryCallAttempt_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SurgeryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurgeryCallAttempt" ADD CONSTRAINT "SurgeryCallAttempt_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurgeryDocument" ADD CONSTRAINT "SurgeryDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SurgeryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurgeryDocument" ADD CONSTRAINT "SurgeryDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
