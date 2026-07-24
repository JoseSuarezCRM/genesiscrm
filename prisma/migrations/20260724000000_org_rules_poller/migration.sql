-- CreateTable
CREATE TABLE "OrgRulesPoller" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastRunAt" TIMESTAMP(3),
    "lastMerged" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrgRulesPoller_pkey" PRIMARY KEY ("id")
);
