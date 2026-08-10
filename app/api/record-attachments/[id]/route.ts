import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { recordPermKey } from "@/lib/record-perm-key"

// Streams a record attachment to a signed-in user who can VIEW the record's
// object. Private (may be PHI) — not a public link. Read the private blob with
// the SDK and force a download.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const row = await (prisma as any).recordAttachment.findUnique({ where: { id: params.id } })
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!userCanLevel(session.user as any, recordPermKey(row.recordType), "VIEW")) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const result = await get(row.blobUrl, { access: "private" }).catch(() => null)
  if (!result || !result.stream) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const safeName = String(row.name || "download").replace(/["\\\r\n]/g, "_")
  return new NextResponse(result.stream as any, {
    headers: {
      "Content-Type": row.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  })
}
