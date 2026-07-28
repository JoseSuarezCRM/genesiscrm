-- CreateTable
CREATE TABLE "OrgRulesRunLog" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "mergedCount" INTEGER NOT NULL DEFAULT 0,
    "merges" JSONB NOT NULL,

    CONSTRAINT "OrgRulesRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgRulesRunLog_ranAt_idx" ON "OrgRulesRunLog"("ranAt");
