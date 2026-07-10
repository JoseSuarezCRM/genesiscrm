-- Custom objects (HubSpot-style): admin-defined object types + their records.
CREATE TABLE "CustomObjectDef" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "singular" TEXT NOT NULL,
    "plural" TEXT NOT NULL,
    "icon" TEXT,
    "ownerLabel" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomObjectDef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomObjectDef_key_key" ON "CustomObjectDef"("key");

CREATE TABLE "CustomObjectRecord" (
    "id" TEXT NOT NULL,
    "objectDefId" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "ownerId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "lastViewedById" TEXT,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomObjectRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomObjectRecord_objectDefId_idx" ON "CustomObjectRecord"("objectDefId");

ALTER TABLE "CustomObjectDef" ADD CONSTRAINT "CustomObjectDef_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomObjectRecord" ADD CONSTRAINT "CustomObjectRecord_objectDefId_fkey"
    FOREIGN KEY ("objectDefId") REFERENCES "CustomObjectDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomObjectRecord" ADD CONSTRAINT "CustomObjectRecord_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomObjectRecord" ADD CONSTRAINT "CustomObjectRecord_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
