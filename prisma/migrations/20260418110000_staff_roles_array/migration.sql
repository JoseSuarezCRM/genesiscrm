-- Add roles array to StaffMember (multi-role scheduling eligibility)
ALTER TABLE "StaffMember" ADD COLUMN "roles" "StaffRole"[] NOT NULL DEFAULT ARRAY[]::"StaffRole"[];

-- Seed from existing primaryRole so no data is lost
UPDATE "StaffMember" SET "roles" = ARRAY["primaryRole"];
