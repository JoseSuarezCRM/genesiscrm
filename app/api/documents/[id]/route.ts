import { NextRequest, NextResponse } from "next/server"
import { del } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { AuditAction } from "@prisma/client"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!userCanLevel(session.user as any, "REFERRALS", "EDIT")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    select: { id: true, referralId: true, fileUrl: true, uploadedById: true },
  })
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // HIPAA: only the uploader or an admin can delete a document
  const isAdmin = (session.user as { role?: string }).role === "ADMIN"
  const isOwner = doc.uploadedById === session.user.id
  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Delete from Vercel Blob
  try {
    await del(doc.fileUrl)
  } catch {
    // Blob may already be gone — still remove the DB record
  }

  await prisma.document.delete({ where: { id: params.id } })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.DOCUMENT_DELETE,
    resourceType: "Document",
    resourceId: params.id,
    metadata: { referralId: doc.referralId },
  })

  return NextResponse.json({ success: true })
}
