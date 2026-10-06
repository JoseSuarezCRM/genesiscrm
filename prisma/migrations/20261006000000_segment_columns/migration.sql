-- The columns a segment's record list shows, saved on the segment for everyone.
-- Null means the default set (lib/segment-table.ts).
-- IF NOT EXISTS because local development runs against the production database
-- with `prisma db push`, which will already have added the column by the time
-- `prisma migrate deploy` runs this file on Vercel.
ALTER TABLE "Segment" ADD COLUMN IF NOT EXISTS "columns" JSONB;
