import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { recordPermKey } from "@/lib/record-perm-key"

// Uploads a file attached to a record. Bytes go to the PRIVATE Blob store (these
// may be PHI); served back only through the authenticated
// /api/record-attachments/[id] route. Gated by EDIT on the record's object.
const MAX = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  const recordType = String(form.get("recordType") ?? "")
  const recordId = String(form.get("recordId") ?? "")
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!recordType || !recordId) return NextResponse.json({ error: "Missing record" }, { status: 400 })
  if (!userCanLevel(session.user as any, recordPermKey(recordType), "EDIT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (file.size > MAX) return NextResponse.json({ error: "File exceeds 25 MB." }, { status: 400 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Storage isn't configured (BLOB_READ_WRITE_TOKEN missing)." }, { status: 500 })

  const safe = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_")
  const key = `record-attachments/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
  try {
    const blob = await put(key, file, { access: "private", contentType: file.type || "application/octet-stream" })
    const row = await (prisma as any).recordAttachment.create({
      data: {
        recordType, recordId,
        name: file.name || safe,
        blobUrl: blob.url,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        createdById: (session.user as any).id ?? null,
      },
    })
    return NextResponse.json({ id: row.id, name: row.name, url: `/api/record-attachments/${row.id}`, contentType: row.contentType, size: row.size, createdAt: row.createdAt })
  } catch (err) {
    return NextResponse.json({ error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
