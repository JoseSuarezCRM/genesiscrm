-- CreateTable
CREATE TABLE "CardLayout" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardLayout_entityType_cardName_key" ON "CardLayout"("entityType", "cardName");
