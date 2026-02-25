import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

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

  // Save to local filesystem under public/uploads/
  const uploadDir = path.join(process.cwd(), "public", "uploads", "referrals", referralId)
  await mkdir(uploadDir, { recursive: true })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const uniqueName = `${Date.now()}-${safeName}`
  const filePath = path.join(uploadDir, uniqueName)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  const fileUrl = `/uploads/referrals/${referralId}/${uniqueName}`

  // Save document record
  const doc = await prisma.document.create({
    data: {
      referralId,
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      contentType: file.type,
      uploadedById: session.user.id,
    },
  })

  return NextResponse.json(doc)
}
