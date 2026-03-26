import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { AuditAction } from "@prisma/client"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    select: { id: true, referralId: true, fileUrl: true, fileName: true, contentType: true },
  })
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.DOCUMENT_VIEW,
    resourceType: "Document",
    resourceId: doc.id,
    metadata: { referralId: doc.referralId },
  })

  // Fetch from Vercel Blob and proxy back to the authenticated user
  const blobRes = await fetch(doc.fileUrl)
  if (!blobRes.ok) {
    return NextResponse.json({ error: "File not found in storage" }, { status: 404 })
  }

  const contentType = doc.contentType ?? "application/octet-stream"
  const headers = new Headers()
  headers.set("Content-Type", contentType)
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(doc.fileName)}"`
  )
  // Prevent caching of PHI
  headers.set("Cache-Control", "no-store")

  return new NextResponse(blobRes.body, { headers })
}
