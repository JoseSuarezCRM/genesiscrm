-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "assignedToId" TEXT;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
