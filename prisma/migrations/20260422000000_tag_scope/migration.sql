-- Create TagScope enum
CREATE TYPE "TagScope" AS ENUM ('REFERRAL', 'ACTIVITY');

-- Add scope column with REFERRAL as default for all existing tags
ALTER TABLE "Tag" ADD COLUMN "scope" "TagScope" NOT NULL DEFAULT 'REFERRAL';

-- Migrate tags that are only used by activities (not referrals) to ACTIVITY scope
UPDATE "Tag"
SET "scope" = 'ACTIVITY'
WHERE id IN (SELECT DISTINCT "tagId" FROM "ActivityTag")
  AND id NOT IN (SELECT DISTINCT "tagId" FROM "ReferralTag");

-- Drop old unique constraint on name alone
DROP INDEX "Tag_name_key";

-- Create new compound unique constraint on (name, scope)
CREATE UNIQUE INDEX "Tag_name_scope_key" ON "Tag"("name", "scope");
