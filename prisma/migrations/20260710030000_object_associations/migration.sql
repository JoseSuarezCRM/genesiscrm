-- Data model: associations between objects (custom + built-in)
CREATE TABLE "ObjectAssociationDef" (
    "id" TEXT NOT NULL,
    "typeA" TEXT NOT NULL,
    "typeB" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObjectAssociationDef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ObjectAssociationDef_typeA_typeB_key" ON "ObjectAssociationDef"("typeA", "typeB");

CREATE TABLE "ObjectAssociation" (
    "id" TEXT NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObjectAssociation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ObjectAssociation_fromType_fromId_toType_toId_key" ON "ObjectAssociation"("fromType", "fromId", "toType", "toId");
CREATE INDEX "ObjectAssociation_fromType_fromId_idx" ON "ObjectAssociation"("fromType", "fromId");
CREATE INDEX "ObjectAssociation_toType_toId_idx" ON "ObjectAssociation"("toType", "toId");
