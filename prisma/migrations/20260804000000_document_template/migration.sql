-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "pageSize" TEXT NOT NULL DEFAULT 'LETTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplate_objectType_idx" ON "DocumentTemplate"("objectType");
