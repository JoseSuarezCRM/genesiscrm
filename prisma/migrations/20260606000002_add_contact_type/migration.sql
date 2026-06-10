-- Safe migration: check if enum exists before creating, check if column exists before adding
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContactType') THEN
    CREATE TYPE "ContactType" AS ENUM ('PROVIDER', 'STAFF');
  END IF;
END $$;

ALTER TABLE "ReferringDoctor" ADD COLUMN IF NOT EXISTS "contactType" "ContactType" NOT NULL DEFAULT 'PROVIDER';
