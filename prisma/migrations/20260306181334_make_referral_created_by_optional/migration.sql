-- DropForeignKey
ALTER TABLE "Referral" DROP CONSTRAINT "Referral_createdById_fkey";

-- AlterTable
ALTER TABLE "Referral" ALTER COLUMN "createdById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
