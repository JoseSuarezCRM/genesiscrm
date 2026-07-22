-- Per-option display labels (records store the stable value in "options").
ALTER TABLE "CustomProperty" ADD COLUMN "optionLabels" JSONB;
