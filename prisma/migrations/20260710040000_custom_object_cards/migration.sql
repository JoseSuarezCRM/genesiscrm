-- Configurable detail card layout for custom objects
ALTER TABLE "CustomObjectDef" ADD COLUMN "cards" JSONB NOT NULL DEFAULT '[]';
