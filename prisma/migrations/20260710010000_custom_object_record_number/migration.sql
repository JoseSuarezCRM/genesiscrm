-- Per-object sequential "Record ID" for custom object records
ALTER TABLE "CustomObjectRecord" ADD COLUMN "recordNumber" INTEGER;
CREATE UNIQUE INDEX "CustomObjectRecord_objectDefId_recordNumber_key"
    ON "CustomObjectRecord"("objectDefId", "recordNumber");
