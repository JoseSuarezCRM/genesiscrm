-- CreateTable
CREATE TABLE "OrgNameRule" (
    "id" TEXT NOT NULL,
    "contains" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgNameRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgNameRule_order_idx" ON "OrgNameRule"("order");
