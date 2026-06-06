import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]

// Microsoft Graph simple sendMail caps total message size around 3-4 MB, so keep
// per-file attachments comfortably under that.
const MAX_SIZE_BYTES = 3 * 1024 * 1024 // 3 MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }

  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Allowed: PDF, images, Word/Excel, text/CSV." },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 3 MB limit (email attachment size cap)." },
      { status: 400 }
    )
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Attachment storage isn't configured (BLOB_READ_WRITE_TOKEN missing)." },
      { status: 500 }
    )
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

  try {
    // Private store — the mailer fetches the bytes with the Blob token when sending.
    const blob = await put(`email-attachments/${uniqueName}`, file, {
      access: "private",
      contentType: file.type || "application/octet-stream",
    })

    return NextResponse.json({
      name: file.name,
      contentType: file.type || "application/octet-stream",
      url: blob.url,
      size: file.size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[EMAIL_ATTACHMENT_UPLOAD]", message)
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 })
  }
}
