import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { userCan } from "@/lib/permissions"
import { renderTemplatePdf, fetchImagesFor } from "@/lib/document-pdf"
import { asBlocks } from "@/lib/document-blocks"

export const maxDuration = 60

// POST { blocks, pageSize } → a preview PDF (tokens left literal, images resolved).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !userCan(session.user as any, "MANAGE_USERS")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const blocks = asBlocks(body.blocks)
  const pageSize = typeof body.pageSize === "string" ? body.pageSize : "LETTER"
  const images = await fetchImagesFor(blocks)
  const buffer = await renderTemplatePdf(blocks, images, pageSize)
  return new NextResponse(buffer as any, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="preview.pdf"', "Cache-Control": "no-store" },
  })
}
