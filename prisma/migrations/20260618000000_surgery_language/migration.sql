-- Add language preference to surgery cases (EN / ES)
ALTER TABLE "SurgeryCase" ADD COLUMN "language" TEXT DEFAULT 'EN';
