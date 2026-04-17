-- Add hasMA to ScheduleLocation
ALTER TABLE "ScheduleLocation" ADD COLUMN "hasMA" BOOLEAN NOT NULL DEFAULT true;

-- HP (HPH) has no dedicated XR tech slot
UPDATE "ScheduleLocation" SET "hasXray" = false WHERE "code" = 'HPH';

-- SK and NW don't need an MA
UPDATE "ScheduleLocation" SET "hasMA" = false WHERE "code" IN ('SK', 'NW');

-- StaffLocationAssignment junction table
CREATE TABLE "StaffLocationAssignment" (
    "staffId"    TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    CONSTRAINT "StaffLocationAssignment_pkey" PRIMARY KEY ("staffId", "locationId")
);

ALTER TABLE "StaffLocationAssignment"
    ADD CONSTRAINT "StaffLocationAssignment_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffLocationAssignment"
    ADD CONSTRAINT "StaffLocationAssignment_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "ScheduleLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
