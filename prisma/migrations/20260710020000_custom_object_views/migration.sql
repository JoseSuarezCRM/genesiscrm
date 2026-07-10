-- Saved views for custom object lists
CREATE TABLE "CustomObjectView" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "teamId" TEXT,
    "sharedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomObjectView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomObjectView_objectKey_idx" ON "CustomObjectView"("objectKey");
CREATE INDEX "CustomObjectView_userId_idx" ON "CustomObjectView"("userId");
ALTER TABLE "CustomObjectView" ADD CONSTRAINT "CustomObjectView_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
