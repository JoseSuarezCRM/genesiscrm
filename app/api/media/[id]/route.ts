import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// PUBLIC serving route for media assets. The bytes live in the private Blob
// store; we stream them out (with the token, server-side) under an unguessable
// id so the same URL renders in the builder, in recipients' email clients, and
// in generated PDFs. Only template resources (logos/banners) are stored here —
// never PHI — so unauthenticated read is acceptable and required for email.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const res = await fetch(asset.blobUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const buf = Buffer.from(await res.arrayBuffer())
  return new NextResponse(buf as any, {
    headers: {
      "Content-Type": asset.contentType || res.headers.get("content-type") || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
