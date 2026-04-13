-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT,
    "locationId" TEXT,
    "nextStep" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frontDesk" TEXT,
    "flyer" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityProvider" (
    "activityId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,

    CONSTRAINT "ActivityProvider_pkey" PRIMARY KEY ("activityId","doctorId")
);

-- CreateIndex
CREATE INDEX "Activity_practiceId_idx" ON "Activity"("practiceId");

-- CreateIndex
CREATE INDEX "Activity_locationId_idx" ON "Activity"("locationId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "ReferringPractice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "PracticeLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProvider" ADD CONSTRAINT "ActivityProvider_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityProvider" ADD CONSTRAINT "ActivityProvider_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "ReferringDoctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
