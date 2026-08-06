import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { prisma } from "@/lib/prisma"

// PUBLIC serving route for media assets. The bytes live in the private Blob
// store; we stream them out (authenticated server-side via the SDK's get()) under
// an unguessable id so the same URL renders in the builder, in recipients' email
// clients, and in generated PDFs. Only template resources (logos/banners) are
// stored here — never PHI — so unauthenticated read is acceptable and required
// for email. NOTE: private blobs must be read with get({ access: "private" }); a
// plain fetch of the blob url (even with a bearer header) does not work.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: params.id } })
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const result = await get(asset.blobUrl, { access: "private" }).catch(() => null)
  if (!result || !result.stream) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(result.stream as any, {
    headers: {
      "Content-Type": asset.contentType || result.blob?.contentType || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      // Defense-in-depth: don't let the browser sniff a different type, and neuter
      // any script in an uploaded SVG on direct navigation (sandbox = no scripts).
      // <img> embedding is unaffected (images never execute SVG scripts).
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
