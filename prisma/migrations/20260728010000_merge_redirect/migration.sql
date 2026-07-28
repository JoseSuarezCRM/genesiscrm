-- CreateTable
CREATE TABLE "MergeRedirect" (
    "entity" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeRedirect_pkey" PRIMARY KEY ("entity","fromId")
);
