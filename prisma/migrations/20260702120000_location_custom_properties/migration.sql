-- Locations become a custom-property-bearing entity
ALTER TYPE "CustomPropertyEntityType" ADD VALUE 'LOCATION';

-- Store custom property values on the location record (JSON map of propertyId -> value)
ALTER TABLE "PracticeLocation" ADD COLUMN "customProperties" JSONB NOT NULL DEFAULT '{}';
