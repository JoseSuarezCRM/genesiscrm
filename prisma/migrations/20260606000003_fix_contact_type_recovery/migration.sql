-- Recovery: handle partially failed ContactType creation
DROP TYPE IF EXISTS "ContactType" CASCADE;

-- Create the enum fresh
CREATE TYPE "ContactType" AS ENUM ('PROVIDER', 'STAFF');

-- Add column if it doesn't exist
ALTER TABLE "ReferringDoctor" ADD COLUMN IF NOT EXISTS "contactType" "ContactType" NOT NULL DEFAULT 'PROVIDER';
