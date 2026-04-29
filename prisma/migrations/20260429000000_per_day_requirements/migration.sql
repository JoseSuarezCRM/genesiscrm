-- Add per-day count columns, copying existing count into all days, then drop count
ALTER TABLE "LocationRoleRequirement" ADD COLUMN "countMon" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocationRoleRequirement" ADD COLUMN "countTue" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocationRoleRequirement" ADD COLUMN "countWed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocationRoleRequirement" ADD COLUMN "countThu" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LocationRoleRequirement" ADD COLUMN "countFri" INTEGER NOT NULL DEFAULT 0;

UPDATE "LocationRoleRequirement"
SET "countMon" = "count",
    "countTue" = "count",
    "countWed" = "count",
    "countThu" = "count",
    "countFri" = "count";

ALTER TABLE "LocationRoleRequirement" DROP COLUMN "count";
