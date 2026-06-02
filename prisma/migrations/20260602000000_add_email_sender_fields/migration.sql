ALTER TABLE "EmailBroadcast" ADD COLUMN "fromSender" TEXT NOT NULL DEFAULT 'referrals';
ALTER TABLE "SequenceStep" ADD COLUMN "fromSender" TEXT NOT NULL DEFAULT 'referrals';
