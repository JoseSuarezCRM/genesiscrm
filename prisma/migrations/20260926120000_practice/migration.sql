-- The practice every surgeon site shares.
--
-- A singleton: one row, id 'default'. Holds the office roster, insurance lists,
-- hours and medical-legal contacts — organisation-level data that lived in the
-- site app's code, where the office roster carried a per-surgeon flag and so
-- served one surgeon's clinics on another's contact page.
--
-- JSON for the same reason SurgeonSite.content is: mostly nested lists, and
-- columns would mean a schema push every time the marketing site grew a section.
CREATE TABLE "Practice" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "content" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);
