-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRunChange" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "before" JSONB,

    CONSTRAINT "ImportRunChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRunAssoc" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "ImportRunAssoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_objectKey_createdAt_idx" ON "ImportRun"("objectKey", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRunChange_runId_idx" ON "ImportRunChange"("runId");

-- CreateIndex
CREATE INDEX "ImportRunAssoc_runId_idx" ON "ImportRunAssoc"("runId");
