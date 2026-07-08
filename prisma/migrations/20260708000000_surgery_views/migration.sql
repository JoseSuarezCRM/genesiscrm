-- Saved views for the surgery list (mirrors ProviderView)
CREATE TABLE "SurgeryView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "teamId" TEXT,
    "sharedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurgeryView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SurgeryView_userId_idx" ON "SurgeryView"("userId");

ALTER TABLE "SurgeryView" ADD CONSTRAINT "SurgeryView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
