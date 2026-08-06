import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { mediaUrl } from "@/lib/media-url"

// Uploads a reusable media asset (logo, banner, photo). Bytes go to the private
// Blob store; a MediaAsset row is created and the caller gets back a stable
// PUBLIC url (served via /api/media/[id]) that works in the builder, in emails,
// and in generated PDFs — no auth proxy needed to display it.
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]
const MAX = 5 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, "TEMPLATES", "EDIT")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 })
  if (file.type && !ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, GIF, WebP or SVG image." }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: "Image exceeds 5 MB." }, { status: 400 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Storage isn't configured (BLOB_READ_WRITE_TOKEN missing)." }, { status: 500 })

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const key = `media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
  try {
    const blob = await put(key, file, { access: "private", contentType: file.type || "image/png" })
    const asset = await prisma.mediaAsset.create({
      data: {
        name: file.name || safe,
        blobUrl: blob.url,
        contentType: file.type || "image/png",
        size: file.size,
        createdById: (session.user as any).id ?? null,
      },
    })
    return NextResponse.json({ id: asset.id, name: asset.name, url: mediaUrl(asset.id) })
  } catch (err) {
    return NextResponse.json({ error: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
