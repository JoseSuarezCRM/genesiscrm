import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Only PDF and images are allowed." }, { status: 400 })

  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "File exceeds 20 MB limit." }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const blob = await put(`marketing/${Date.now()}-${safeName}`, file, {
    access: "public",
    contentType: file.type,
  })

  return NextResponse.json({ url: blob.url, fileName: file.name })
}
