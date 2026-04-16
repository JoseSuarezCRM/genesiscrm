-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('XR_TECH', 'MA', 'FD');

-- CreateEnum
CREATE TYPE "SchedDay" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('AVAILABLE', 'LAST_RESORT', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "ScheduleLocation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasXray" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ScheduleLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryRole" "StaffRole" NOT NULL,
    "isLastResort" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAvailability" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "day" "SchedDay" NOT NULL,
    "type" "AvailabilityType" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "StaffAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySchedule" (
    "id" TEXT NOT NULL,
    "weekOf" DATE NOT NULL,
    "notes" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "assignedRole" "StaffRole" NOT NULL,
    "day" "SchedDay" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleLocation_code_key" ON "ScheduleLocation"("code");
CREATE INDEX "ScheduleLocation_order_idx" ON "ScheduleLocation"("order");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAvailability_staffId_day_key" ON "StaffAvailability"("staffId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySchedule_weekOf_key" ON "WeeklySchedule"("weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleEntry_scheduleId_locationId_staffId_day_key" ON "ScheduleEntry"("scheduleId", "locationId", "staffId", "day");
CREATE INDEX "ScheduleEntry_scheduleId_day_idx" ON "ScheduleEntry"("scheduleId", "day");

-- AddForeignKey
ALTER TABLE "StaffAvailability" ADD CONSTRAINT "StaffAvailability_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WeeklySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ScheduleLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default locations (order matches STC,OB,LV,AR,JO,WG,HPH,GU,PCC,EW,NW,SK)
INSERT INTO "ScheduleLocation" ("id","code","name","hasXray","order") VALUES
  (gen_random_uuid(),'STC','STC',true,1),
  (gen_random_uuid(),'OB','OB',true,2),
  (gen_random_uuid(),'LV','LV',true,3),
  (gen_random_uuid(),'AR','AR',true,4),
  (gen_random_uuid(),'JO','JO',false,5),
  (gen_random_uuid(),'WG','WG',true,6),
  (gen_random_uuid(),'HPH','HPH',true,7),
  (gen_random_uuid(),'GU','GU',false,8),
  (gen_random_uuid(),'PCC','PCC',true,9),
  (gen_random_uuid(),'EW','EW',false,10),
  (gen_random_uuid(),'NW','NW',true,11),
  (gen_random_uuid(),'SK','SK',true,12)
ON CONFLICT ("code") DO NOTHING;
