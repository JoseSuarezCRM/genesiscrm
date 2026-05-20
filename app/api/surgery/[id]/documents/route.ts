import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
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
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const surgeryCase = await (prisma as any).surgeryCase.findUnique({ where: { id: params.id } })
  if (!surgeryCase) return NextResponse.json({ error: "Surgery case not found" }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Only PDF, images, and Word documents are allowed." }, { status: 400 })

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const blob = await put(`surgery/${params.id}/${Date.now()}-${safeName}`, file, {
    access: "private",
    contentType: file.type,
  })

  const doc = await (prisma as any).surgeryDocument.create({
    data: {
      caseId: params.id,
      fileName: file.name,
      fileUrl: blob.url,
      fileSize: file.size,
      contentType: file.type,
      uploadedById: session.user.id,
    },
  })

  return NextResponse.json(doc)
}
