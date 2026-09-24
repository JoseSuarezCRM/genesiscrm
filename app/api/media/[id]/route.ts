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

  const contentType = asset.contentType || result.blob?.contentType || "image/png"

  // `sandbox` is what neuters script in an uploaded SVG opened by direct
  // navigation, and it must stay for anything the browser would treat as a
  // document. It is deliberately NOT applied to PDFs: a sandboxed response
  // becomes an opaque origin, which is reported to stop Chrome's built-in PDF
  // viewer from displaying the file. The PDFs served here are patient rehab
  // protocols linked from the public surgeon sites, so "the browser refuses to
  // show it" is a patient not getting their post-operative instructions.
  //
  // Dropping the token for PDFs costs little: `default-src 'none'` still blocks
  // subresource loads, `nosniff` plus an accurate Content-Type prevents the type
  // confusion that the header is really guarding against, and the PDF viewer
  // already denies PDF-embedded JavaScript any network or DOM access.
  const isDocument = /svg|xml|html/i.test(contentType)
  const csp = isDocument
    ? "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    : "default-src 'none'; style-src 'unsafe-inline'"

  return new NextResponse(result.stream as any, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // Defense-in-depth: don't let the browser sniff a different type.
      // <img> embedding is unaffected (images never execute SVG scripts).
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": csp,
      // Show the file rather than downloading it, and give it a real filename
      // when the reader does save it — "cmuf9xswt000057a1b3lc13vh" is not a
      // useful name for a rehabilitation protocol.
      "Content-Disposition": `inline; filename="${asset.name.replace(/["\\\r\n]/g, "")}"`,
    },
  })
}
