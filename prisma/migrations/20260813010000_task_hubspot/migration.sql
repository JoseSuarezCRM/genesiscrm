-- New enums
CREATE TYPE "TaskType" AS ENUM ('TODO', 'CALL', 'EMAIL');
CREATE TYPE "TaskRepeat" AS ENUM ('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY');

-- Expand TaskStatus (TODO/IN_PROGRESS/DONE) → 5 stages, remapping existing rows.
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'DEFERRED');
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus" USING (
  CASE "status"::text
    WHEN 'TODO' THEN 'NOT_STARTED'
    WHEN 'DONE' THEN 'COMPLETED'
    ELSE "status"::text
  END::"TaskStatus"
);
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';
DROP TYPE "TaskStatus_old";

-- Task queue
CREATE TABLE "TaskQueue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskQueue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskQueue_name_key" ON "TaskQueue"("name");

-- New Task columns
ALTER TABLE "Task" ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'TODO';
ALTER TABLE "Task" ADD COLUMN "repeat" "TaskRepeat" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Task" ADD COLUMN "reminderMinutesBefore" INTEGER;
ALTER TABLE "Task" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "queueId" TEXT;

CREATE INDEX "Task_queueId_idx" ON "Task"("queueId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "TaskQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
