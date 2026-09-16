// The files a record holds, in a shape the mailer can attach.
//
// Two stores, for historical reasons: referrals keep theirs in `Document`
// (referralId FK, behind DocumentList), everything else uses `RecordAttachment`
// (recordType + recordId, behind the Attachments card). A caller shouldn't have
// to know which, so this reads whichever applies.
//
// Both hold **private** Blob URLs, and buildGraphAttachments already fetches
// those with the Blob token — so the raw blobUrl is what gets returned here, not
// the /api/record-attachments/<id> proxy that listRecordAttachments returns.
// That route is session-gated and would 401 from a cron-driven send.
//
// Server-only, and deliberately session-free: the automation engine calls it
// with no user context.

import { prisma } from "@/lib/prisma"

export interface RecordDocument {
  name: string
  contentType: string
  /** Private Blob URL — read server-side with BLOB_READ_WRITE_TOKEN. */
  url: string
  size: number
}

export interface RecordDocumentOptions {
  /** Keep only files whose name contains this (case-insensitive). */
  nameContains?: string | null
  /** Names already on the message — used to avoid attaching the same file twice. */
  excludeNames?: string[]
}

/**
 * Every document on a record, newest first.
 *
 * `excludeNames` matters more than it looks: a workflow that generates a PDF
 * saves it back onto the record as a RecordAttachment, so on the *next* run that
 * generated file is also a record document. Without the exclusion the recipient
 * would get it twice.
 */
export async function recordDocumentsFor(
  recordType: string,
  recordId: string,
  opts: RecordDocumentOptions = {},
): Promise<RecordDocument[]> {
  if (!recordType || !recordId) return []

  let docs: RecordDocument[] = []
  try {
    if (recordType === "REFERRAL") {
      const rows = await prisma.document.findMany({
        where: { referralId: recordId },
        orderBy: { createdAt: "desc" },
        select: { fileName: true, fileUrl: true, contentType: true, fileSize: true },
      })
      docs = rows.map((r) => ({
        name: r.fileName,
        url: r.fileUrl,
        contentType: r.contentType || "application/octet-stream",
        size: r.fileSize ?? 0,
      }))
    } else {
      const rows = await (prisma as any).recordAttachment.findMany({
        where: { recordType, recordId },
        orderBy: { createdAt: "desc" },
        select: { name: true, blobUrl: true, contentType: true, size: true },
      })
      docs = rows.map((r: any) => ({
        name: r.name,
        url: r.blobUrl,
        contentType: r.contentType || "application/octet-stream",
        size: r.size ?? 0,
      }))
    }
  } catch {
    return []
  }

  const needle = (opts.nameContains ?? "").trim().toLowerCase()
  if (needle) docs = docs.filter((d) => d.name.toLowerCase().includes(needle))

  // Drop only what the caller already has on the message.
  const excluded = new Set((opts.excludeNames ?? []).map((n) => n.toLowerCase()))
  docs = docs.filter((d) => !excluded.has(d.name.toLowerCase()))

  // Records really do hold several files under one name — 4 of 259 today, and in
  // some of those the sizes differ, so they are different documents. Keep them
  // all and disambiguate instead: dropping by name would lose a real file, and
  // two identically-named attachments confuse mail clients.
  const used = new Map<string, number>()
  return docs.map((d) => {
    const key = d.name.toLowerCase()
    const n = (used.get(key) ?? 0) + 1
    used.set(key, n)
    return n === 1 ? d : { ...d, name: suffixName(d.name, n) }
  })
}

/** "scan.pdf" + 2 → "scan (2).pdf" — before the extension, as Windows does. */
function suffixName(name: string, n: number): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`
}

/** How many documents a record has — for the composer's button label. */
export async function countRecordDocuments(recordType: string, recordId: string): Promise<number> {
  return (await recordDocumentsFor(recordType, recordId)).length
}
