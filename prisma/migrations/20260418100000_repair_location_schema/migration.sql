-- Idempotent repair: ensures openDays, LocationRoleRequirement, and StaffLocationAssignment
-- exist regardless of which prior migrations ran on this database.

-- 1. Add openDays if missing
ALTER TABLE "ScheduleLocation" ADD COLUMN IF NOT EXISTS "openDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. Create LocationRoleRequirement if missing
CREATE TABLE IF NOT EXISTS "LocationRoleRequirement" (
    "id"         TEXT    NOT NULL,
    "locationId" TEXT    NOT NULL,
    "role"       "StaffRole" NOT NULL,
    "count"      INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "LocationRoleRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocationRoleRequirement_locationId_role_key"
    ON "LocationRoleRequirement"("locationId", "role");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'LocationRoleRequirement_locationId_fkey'
  ) THEN
    ALTER TABLE "LocationRoleRequirement"
      ADD CONSTRAINT "LocationRoleRequirement_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "ScheduleLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Seed requirements from hasXray / hasMA if they exist and table is empty per location
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ScheduleLocation' AND column_name = 'hasXray'
  ) THEN
    INSERT INTO "LocationRoleRequirement" ("id", "locationId", "role", "count")
    SELECT gen_random_uuid(), id, 'XR_TECH', 1
    FROM "ScheduleLocation"
    WHERE "hasXray" = true
      AND id NOT IN (SELECT "locationId" FROM "LocationRoleRequirement" WHERE "role" = 'XR_TECH');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ScheduleLocation' AND column_name = 'hasMA'
  ) THEN
    INSERT INTO "LocationRoleRequirement" ("id", "locationId", "role", "count")
    SELECT gen_random_uuid(), id, 'MA', 1
    FROM "ScheduleLocation"
    WHERE "hasMA" = true
      AND id NOT IN (SELECT "locationId" FROM "LocationRoleRequirement" WHERE "role" = 'MA');
  END IF;

  -- FD for all locations not yet seeded
  INSERT INTO "LocationRoleRequirement" ("id", "locationId", "role", "count")
  SELECT gen_random_uuid(), id, 'FD', 1
  FROM "ScheduleLocation"
  WHERE id NOT IN (SELECT "locationId" FROM "LocationRoleRequirement" WHERE "role" = 'FD');
END $$;

-- 4. Drop hasXray / hasMA if they still exist
ALTER TABLE "ScheduleLocation" DROP COLUMN IF EXISTS "hasXray";
ALTER TABLE "ScheduleLocation" DROP COLUMN IF EXISTS "hasMA";

-- 5. Create StaffLocationAssignment if missing
CREATE TABLE IF NOT EXISTS "StaffLocationAssignment" (
    "staffId"    TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    CONSTRAINT "StaffLocationAssignment_pkey" PRIMARY KEY ("staffId", "locationId")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StaffLocationAssignment_staffId_fkey'
  ) THEN
    ALTER TABLE "StaffLocationAssignment"
      ADD CONSTRAINT "StaffLocationAssignment_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'StaffLocationAssignment_locationId_fkey'
  ) THEN
    ALTER TABLE "StaffLocationAssignment"
      ADD CONSTRAINT "StaffLocationAssignment_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "ScheduleLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
