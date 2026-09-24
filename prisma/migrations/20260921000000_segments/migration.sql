-- Segments: named, shareable lists of records for any object.
-- ACTIVE segments store a filter and are re-evaluated on read; STATIC segments
-- freeze their membership into SegmentMember rows.

CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objectType" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'FILTER',
    "filter" JSONB,
    "sourceConfig" JSONB,
    "userId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "teamId" TEXT,
    "sharedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "size" INTEGER,
    "sizeAt" TIMESTAMP(3),
    "sizeExact" BOOLEAN NOT NULL DEFAULT true,
    "lastBuiltAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SegmentMember" (
    "segmentId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentMember_pkey" PRIMARY KEY ("segmentId","recordId")
);

CREATE INDEX "Segment_objectType_idx" ON "Segment"("objectType");
CREATE INDEX "Segment_userId_idx" ON "Segment"("userId");
CREATE INDEX "SegmentMember_segmentId_idx" ON "SegmentMember"("segmentId");

ALTER TABLE "Segment" ADD CONSTRAINT "Segment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegmentMember" ADD CONSTRAINT "SegmentMember_segmentId_fkey"
    FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
