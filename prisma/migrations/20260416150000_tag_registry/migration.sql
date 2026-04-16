-- Add activities relation to existing Tag model (no schema changes needed, just the junction table)
-- ActivityTag junction table
CREATE TABLE "ActivityTag" (
    "activityId" TEXT NOT NULL,
    "tagId"      TEXT NOT NULL,
    CONSTRAINT "ActivityTag_pkey" PRIMARY KEY ("activityId", "tagId")
);

ALTER TABLE "ActivityTag" ADD CONSTRAINT "ActivityTag_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityTag" ADD CONSTRAINT "ActivityTag_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate any existing string tags to Tag records + ActivityTag rows
-- (Activities with existing tags[] get tags created with a default gray color)
DO $$
DECLARE
  act RECORD;
  tag_name TEXT;
  tag_id TEXT;
BEGIN
  FOR act IN SELECT id, tags FROM "Activity" WHERE array_length(tags, 1) > 0 LOOP
    FOREACH tag_name IN ARRAY act.tags LOOP
      -- Upsert the tag (use gray as default since we don't know the color)
      INSERT INTO "Tag" (id, name, color, "createdAt")
        VALUES (gen_random_uuid()::text, tag_name, '#64748b', now())
        ON CONFLICT (name) DO NOTHING;
      -- Get the tag id
      SELECT id INTO tag_id FROM "Tag" WHERE name = tag_name;
      -- Create the junction row
      INSERT INTO "ActivityTag" ("activityId", "tagId")
        VALUES (act.id, tag_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Drop the now-replaced string array column
ALTER TABLE "Activity" DROP COLUMN IF EXISTS "tags";
