-- CreateTable
CREATE TABLE "PropertyDisplayConfig" (
    "id" TEXT NOT NULL,
    "customPropertyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyDisplayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyDisplayConfig_customPropertyId_entityType_key" ON "PropertyDisplayConfig"("customPropertyId", "entityType");
