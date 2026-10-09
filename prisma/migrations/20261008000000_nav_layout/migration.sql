-- The organisation's sidebar layout (Settings → Navigation). See lib/nav-layout.ts.
-- IF NOT EXISTS because local development runs against the production database
-- with `prisma db push`, which will already have created the table by the time
-- `prisma migrate deploy` runs this file on Vercel.
CREATE TABLE IF NOT EXISTS "NavLayout" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NavLayout_pkey" PRIMARY KEY ("id")
);
