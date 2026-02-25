import { NextRequest, NextResponse } from "next/server"
import { unlink } from "fs/promises"
import path from "path"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const doc = await prisma.document.findUnique({ where: { id: params.id } })
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
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

  return NextResponse.json({ success: true })
}
