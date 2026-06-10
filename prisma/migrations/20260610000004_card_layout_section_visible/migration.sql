-- Add section (LEFT/RIGHT) and visibility flag to CardLayout
ALTER TABLE "CardLayout" ADD COLUMN "section" TEXT NOT NULL DEFAULT 'RIGHT';
ALTER TABLE "CardLayout" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;
