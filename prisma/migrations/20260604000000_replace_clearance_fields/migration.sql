ALTER TABLE "SurgeryCase" ADD COLUMN "medicalClearance" TEXT;
ALTER TABLE "SurgeryCase" ADD COLUMN "secondaryClearance" TEXT;
ALTER TABLE "SurgeryCase" ADD COLUMN "dentalClearance" TEXT;
ALTER TABLE "SurgeryCase" DROP COLUMN IF EXISTS "clearanceRequired";
