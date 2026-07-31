-- CreateTable
CREATE TABLE "IntakeReferralResponse" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "clientId" TEXT,
    "questionnaireId" TEXT,
    "questionnaireName" TEXT,
    "language" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "rawAnswer" TEXT,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeReferralResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntakeReferralResponse_intakeId_key" ON "IntakeReferralResponse"("intakeId");

-- CreateIndex
CREATE INDEX "IntakeReferralResponse_submittedAt_idx" ON "IntakeReferralResponse"("submittedAt");

-- CreateIndex
CREATE INDEX "IntakeReferralResponse_category_idx" ON "IntakeReferralResponse"("category");
