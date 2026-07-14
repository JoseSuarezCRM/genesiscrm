-- Right-column association card visibility, for every object (built-in + custom)
CREATE TABLE IF NOT EXISTS "AssociationCardPref" (
  "id" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "cardType" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AssociationCardPref_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssociationCardPref_objectType_cardType_key"
  ON "AssociationCardPref"("objectType", "cardType");
