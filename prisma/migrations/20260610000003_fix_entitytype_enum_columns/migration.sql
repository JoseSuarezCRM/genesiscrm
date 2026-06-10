-- Convert text columns to the CustomPropertyEntityType enum to match the Prisma schema
ALTER TABLE "CardLayout" ALTER COLUMN "entityType" TYPE "CustomPropertyEntityType" USING "entityType"::"CustomPropertyEntityType";
ALTER TABLE "PropertyDisplayConfig" ALTER COLUMN "entityType" TYPE "CustomPropertyEntityType" USING "entityType"::"CustomPropertyEntityType";
