-- Create enums
CREATE TYPE "CustomPropertyType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'CHECKBOX', 'DROPDOWN', 'MULTI_SELECT', 'URL');
CREATE TYPE "CustomPropertyEntityType" AS ENUM ('REFERRAL', 'PROVIDER', 'PRACTICE');

-- Create CustomProperty table
CREATE TABLE "CustomProperty" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" "CustomPropertyType" NOT NULL,
  "entityType" "CustomPropertyEntityType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomProperty_name_entityType_key" UNIQUE ("name", "entityType")
);

-- Add customProperties JSON column to ReferringPractice
ALTER TABLE "ReferringPractice" ADD COLUMN "customProperties" JSONB NOT NULL DEFAULT '{}';

-- Add customProperties JSON column to ReferringDoctor
ALTER TABLE "ReferringDoctor" ADD COLUMN "customProperties" JSONB NOT NULL DEFAULT '{}';

-- Add customProperties JSON column to Referral
ALTER TABLE "Referral" ADD COLUMN "customProperties" JSONB NOT NULL DEFAULT '{}';
