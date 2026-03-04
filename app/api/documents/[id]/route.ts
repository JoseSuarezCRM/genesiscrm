import { NextRequest, NextResponse } from "next/server"
import { unlink } from "fs/promises"
import path from "path"
import { auth } from "@/lib/auth"
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

  // Delete from local filesystem
  if (doc.fileUrl.startsWith("/uploads/")) {
    try {
      const filePath = path.join(process.cwd(), "public", doc.fileUrl)
      await unlink(filePath)
    } catch {
      // File may already be gone — still remove the DB record
    }
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
