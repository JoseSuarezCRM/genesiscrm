CREATE TABLE "MarketingCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingOrder" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "notifyEmail" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "MarketingConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingItem_categoryId_idx" ON "MarketingItem"("categoryId");
CREATE INDEX "MarketingOrder_itemId_idx" ON "MarketingOrder"("itemId");
CREATE INDEX "MarketingOrder_status_idx" ON "MarketingOrder"("status");

ALTER TABLE "MarketingItem" ADD CONSTRAINT "MarketingItem_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "MarketingCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingOrder" ADD CONSTRAINT "MarketingOrder_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "MarketingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
