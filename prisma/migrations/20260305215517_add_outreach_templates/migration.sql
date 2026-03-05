-- CreateTable
CREATE TABLE "OutreachTemplate" (
    "id" TEXT NOT NULL,
    "trigger" "OutreachTrigger" NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutreachTemplate_trigger_channel_key" ON "OutreachTemplate"("trigger", "channel");
