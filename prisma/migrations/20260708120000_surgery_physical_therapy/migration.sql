-- Physical Therapy field for surgery cases (+ free-text detail for "External")
ALTER TABLE "SurgeryCase" ADD COLUMN "physicalTherapy" TEXT;
ALTER TABLE "SurgeryCase" ADD COLUMN "physicalTherapyDetail" TEXT;
