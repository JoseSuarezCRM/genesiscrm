-- CreateEnum
CREATE TYPE "IvrAction" AS ENUM ('PLAY_MESSAGE', 'FORWARD_CALL', 'HANG_UP');

-- CreateTable
CREATE TABLE "IvrConfig" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "greeting" TEXT NOT NULL DEFAULT 'Thank you for calling. Please listen to the following options.',
    "noInputMessage" TEXT NOT NULL DEFAULT 'We did not receive your input. Goodbye.',
    "invalidMessage" TEXT NOT NULL DEFAULT 'That is not a valid option. Please try again.',
    "gatherTimeout" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IvrConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IvrOption" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "digit" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "action" "IvrAction" NOT NULL,
    "message" TEXT,
    "forwardTo" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IvrOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsAutoResponse" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'exact',
    "response" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsAutoResponse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IvrOption" ADD CONSTRAINT "IvrOption_configId_fkey" FOREIGN KEY ("configId") REFERENCES "IvrConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
