CREATE TABLE "DirectEmail" (
    "id"       TEXT NOT NULL,
    "to"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cc"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "bcc"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "subject"  TEXT NOT NULL,
    "body"     TEXT NOT NULL,
    "sentAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success"  BOOLEAN NOT NULL DEFAULT true,
    "error"    TEXT,
    "sentById" TEXT NOT NULL,
    CONSTRAINT "DirectEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectEmail_sentAt_idx" ON "DirectEmail"("sentAt");

ALTER TABLE "DirectEmail" ADD CONSTRAINT "DirectEmail_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
