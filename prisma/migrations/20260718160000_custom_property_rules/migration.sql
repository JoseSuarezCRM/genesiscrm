-- Field-type default value + "require unique values" rule for custom properties.
ALTER TABLE "CustomProperty" ADD COLUMN "defaultValue" TEXT;
ALTER TABLE "CustomProperty" ADD COLUMN "unique" BOOLEAN NOT NULL DEFAULT false;
