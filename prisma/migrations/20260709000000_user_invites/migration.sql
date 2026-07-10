-- User invitation flow: pending users set their own password via a tokened link
ALTER TABLE "User" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "User" ADD COLUMN "inviteTokenExpires" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");
