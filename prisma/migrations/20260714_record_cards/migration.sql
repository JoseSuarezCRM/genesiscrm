-- Property cards for custom objects (built-ins keep CardLayout)
CREATE TABLE IF NOT EXISTS "RecordCard" (
  "id" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "cardName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "section" TEXT NOT NULL DEFAULT 'LEFT',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecordCard_objectType_cardName_key" ON "RecordCard"("objectType", "cardName");
