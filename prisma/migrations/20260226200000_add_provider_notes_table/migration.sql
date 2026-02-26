-- Drop the simple notes column from ReferringDoctor
ALTER TABLE "ReferringDoctor" DROP COLUMN IF EXISTS "notes";

-- Create ProviderNote table
CREATE TABLE "ProviderNote" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderNote_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "ProviderNote" ADD CONSTRAINT "ProviderNote_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ReferringDoctor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderNote" ADD CONSTRAINT "ProviderNote_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
