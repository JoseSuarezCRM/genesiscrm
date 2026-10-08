-- Admins' names for built-in fields (Settings → Properties). See lib/native-labels.ts.
-- IF NOT EXISTS because local development runs against the production database
-- with `prisma db push`, which will already have created the table by the time
-- `prisma migrate deploy` runs this file on Vercel.
CREATE TABLE IF NOT EXISTS "NativeFieldLabel" (
    "objectType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NativeFieldLabel_pkey" PRIMARY KEY ("objectType", "fieldKey")
);
