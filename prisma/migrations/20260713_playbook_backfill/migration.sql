-- Bring the built-in objects up to the New Object Playbook:
-- record owner, full audit trail, and custom properties everywhere.

ALTER TYPE "CustomPropertyEntityType" ADD VALUE IF NOT EXISTS 'SURGERY';
ALTER TYPE "CustomPropertyEntityType" ADD VALUE IF NOT EXISTS 'ACTIVITY';
ALTER TYPE "CustomPropertyEntityType" ADD VALUE IF NOT EXISTS 'TASK';

-- Providers
ALTER TABLE "ReferringDoctor" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "ReferringDoctor" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "ReferringDoctor" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "ReferringDoctor" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Practices
ALTER TABLE "ReferringPractice" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "ReferringPractice" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "ReferringPractice" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "ReferringPractice" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Locations
ALTER TABLE "PracticeLocation" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "PracticeLocation" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "PracticeLocation" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "PracticeLocation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Surgery cases
ALTER TABLE "SurgeryCase" ADD COLUMN IF NOT EXISTS "customProperties" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "SurgeryCase" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "SurgeryCase" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

-- Activities
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "customProperties" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Tasks
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "customProperties" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "updatedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "ReferringDoctor" ADD CONSTRAINT "ReferringDoctor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "ReferringDoctor" ADD CONSTRAINT "ReferringDoctor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "ReferringDoctor" ADD CONSTRAINT "ReferringDoctor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "ReferringPractice" ADD CONSTRAINT "ReferringPractice_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "ReferringPractice" ADD CONSTRAINT "ReferringPractice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "ReferringPractice" ADD CONSTRAINT "ReferringPractice_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "PracticeLocation" ADD CONSTRAINT "PracticeLocation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "PracticeLocation" ADD CONSTRAINT "PracticeLocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "PracticeLocation" ADD CONSTRAINT "PracticeLocation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "SurgeryCase" ADD CONSTRAINT "SurgeryCase_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ALTER TABLE "Task" ADD CONSTRAINT "Task_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
