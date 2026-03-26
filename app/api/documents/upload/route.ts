import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createAuditLog } from "@/lib/audit"
import { AuditAction } from "@prisma/client"

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const referralId = formData.get("referralId") as string | null

  if (!file || !referralId) {
    return NextResponse.json({ error: "Missing file or referralId" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only PDF, images, and Word documents are allowed." },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 10 MB limit." },
      { status: 400 }
    )
  }

  // Verify the referral exists
  const referral = await prisma.referral.findUnique({ where: { id: referralId } })
  if (!referral) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const uniqueName = `${Date.now()}-${safeName}`

  // Upload to Vercel Blob
  const blob = await put(`referrals/${referralId}/${uniqueName}`, file, {
    access: "public",
    contentType: file.type,
  })

  // Save document record
  const doc = await prisma.document.create({
    data: {
      referralId,
      fileName: file.name,
      fileUrl: blob.url,
      fileSize: file.size,
      contentType: file.type,
      uploadedById: session.user.id,
    },
  })

  await createAuditLog({
    userId: session.user.id,
    action: AuditAction.DOCUMENT_UPLOAD,
    resourceType: "Document",
    resourceId: doc.id,
    metadata: { referralId, fileName: file.name },
  })

  return NextResponse.json(doc)
}
