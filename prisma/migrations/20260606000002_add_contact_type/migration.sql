ALTER TYPE "ContactType" CREATE;
CREATE TYPE "ContactType" AS ENUM ('PROVIDER', 'STAFF');
ALTER TABLE "ReferringDoctor" ADD COLUMN "contactType" "ContactType" NOT NULL DEFAULT 'PROVIDER';
