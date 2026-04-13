-- CreateTable
CREATE TABLE "CompletedAppointment" (
    "id" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "mrn" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "referringProvider" TEXT NOT NULL,
    "referringProviderAddress" TEXT,
    "referringProviderPhone" TEXT,
    "importBatchId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "CompletedAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompletedAppointment_referringProvider_idx" ON "CompletedAppointment"("referringProvider");

-- CreateIndex
CREATE INDEX "CompletedAppointment_importedAt_idx" ON "CompletedAppointment"("importedAt");

-- CreateIndex
CREATE INDEX "CompletedAppointment_importBatchId_idx" ON "CompletedAppointment"("importBatchId");

-- AddForeignKey
ALTER TABLE "CompletedAppointment" ADD CONSTRAINT "CompletedAppointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
