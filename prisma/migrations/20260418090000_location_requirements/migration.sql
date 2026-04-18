-- Add openDays to ScheduleLocation
ALTER TABLE "ScheduleLocation" ADD COLUMN "openDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Create LocationRoleRequirement table
CREATE TABLE "LocationRoleRequirement" (
    "id"         TEXT    NOT NULL,
    "locationId" TEXT    NOT NULL,
    "role"       "StaffRole" NOT NULL,
    "count"      INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "LocationRoleRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocationRoleRequirement_locationId_role_key"
    ON "LocationRoleRequirement"("locationId", "role");

ALTER TABLE "LocationRoleRequirement"
    ADD CONSTRAINT "LocationRoleRequirement_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "ScheduleLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate hasXray=true → XR_TECH requirement count 1
INSERT INTO "LocationRoleRequirement" ("id", "locationId", "role", "count")
SELECT gen_random_uuid(), id, 'XR_TECH', 1
FROM "ScheduleLocation" WHERE "hasXray" = true;

-- Migrate hasMA=true → MA requirement count 1
INSERT INTO "LocationRoleRequirement" ("id", "locationId", "role", "count")
SELECT gen_random_uuid(), id, 'MA', 1
FROM "ScheduleLocation" WHERE "hasMA" = true;

-- All locations get FD count 1 (matches previous default behaviour)
INSERT INTO "LocationRoleRequirement" ("id", "locationId", "role", "count")
SELECT gen_random_uuid(), id, 'FD', 1
FROM "ScheduleLocation";

-- Drop the now-redundant boolean columns
ALTER TABLE "ScheduleLocation" DROP COLUMN "hasXray";
ALTER TABLE "ScheduleLocation" DROP COLUMN "hasMA";
