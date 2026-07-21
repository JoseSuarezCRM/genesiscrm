-- Human-readable internal name (token slug) for custom properties.
ALTER TABLE "CustomProperty" ADD COLUMN "internalName" TEXT;

-- Backfill from the display name: lowercase, non-alphanumerics → underscore.
UPDATE "CustomProperty"
SET "internalName" = trim(both '_' from regexp_replace(lower("name"), '[^a-z0-9]+', '_', 'g'))
WHERE "internalName" IS NULL;

-- De-duplicate any collisions within an entity by appending a counter.
WITH ranked AS (
  SELECT "id",
         "internalName",
         row_number() OVER (PARTITION BY "entityType", "internalName" ORDER BY "createdAt") AS rn
  FROM "CustomProperty"
)
UPDATE "CustomProperty" cp
SET "internalName" = cp."internalName" || '_' || ranked.rn
FROM ranked
WHERE cp."id" = ranked."id" AND ranked.rn > 1;

CREATE UNIQUE INDEX "CustomProperty_internalName_entityType_key" ON "CustomProperty"("internalName", "entityType");
