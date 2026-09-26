-- Per-site key for opening a draft preview.
--
-- Replaces a shared secret that had to be set identically on two Vercel
-- projects and rebuilt on both to change. That was the only configuration
-- requiring sync between them, and drift silently removed the Preview draft
-- button with nothing explaining why.
--
-- Nullable: generated on first use, so no backfill and a site that is never
-- previewed never gets one.
ALTER TABLE "SurgeonSite" ADD COLUMN "previewToken" TEXT;
