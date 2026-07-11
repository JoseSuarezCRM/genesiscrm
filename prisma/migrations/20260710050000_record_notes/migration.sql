-- Notes on any record (first engagement type in the activity feed)
CREATE TABLE "RecordNote" (
    "id" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecordNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecordNote_recordType_recordId_idx" ON "RecordNote"("recordType", "recordId");
ALTER TABLE "RecordNote" ADD CONSTRAINT "RecordNote_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
