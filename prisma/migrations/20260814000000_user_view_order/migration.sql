-- CreateTable
CREATE TABLE "UserViewOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewType" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT '',
    "orderedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserViewOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserViewOrder_userId_viewType_scopeKey_key" ON "UserViewOrder"("userId", "viewType", "scopeKey");

-- AddForeignKey
ALTER TABLE "UserViewOrder" ADD CONSTRAINT "UserViewOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
