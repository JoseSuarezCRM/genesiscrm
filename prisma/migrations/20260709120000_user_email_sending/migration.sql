-- Per-user toggle: send app emails from the user's own org mailbox
ALTER TABLE "User" ADD COLUMN "emailSendingEnabled" BOOLEAN NOT NULL DEFAULT false;
