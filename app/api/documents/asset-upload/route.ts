import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"

// Uploads a document-template image asset (logo, signature). These are template
// assets reused across records — stored public (random URL) so the builder can
// preview them and the PDF renderer can fetch them without a token.
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"]
const MAX = 3 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, "TEMPLATES", "EDIT")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 })
  if (file.type && !ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, GIF or WebP image." }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: "Image exceeds 3 MB." }, { status: 400 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Storage isn't configured (BLOB_READ_WRITE_TOKEN missing)." }, { status: 500 })

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
  try {
    const blob = await put(`document-assets/${name}`, file, { access: "public", contentType: file.type || "image/png" })
    return NextResponse.json({ url: blob.url })
  } catch (err) {
    return NextResponse.json({ error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
