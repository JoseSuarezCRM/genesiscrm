import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { generateDocumentPdf } from "@/lib/document-pdf"

// PDF generation can pull in fonts/images; give it headroom.
export const maxDuration = 60

function permKeyFor(recordType: string): string {
  if (recordType.startsWith("CO:")) return recordType
  return ({ REFERRAL: "REFERRALS", PROVIDER: "PROVIDERS", PRACTICE: "PRACTICES", LOCATION: "LOCATIONS", SURGERY: "SURGERY" } as Record<string, string>)[recordType] ?? recordType
}

// GET ?template=&type=&id= → the filled PDF for that record (download/preview).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const templateId = url.searchParams.get("template") ?? ""
  const type = url.searchParams.get("type") ?? ""
  const id = url.searchParams.get("id") ?? ""
  if (!templateId || !type || !id) return NextResponse.json({ error: "Missing template, type or id." }, { status: 400 })

  if (!userCanLevel(session.user as any, permKeyFor(type), "VIEW")) {
    return NextResponse.json({ error: "You don't have access to this record." }, { status: 403 })
  }

  const res = await generateDocumentPdf(templateId, type, id)
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 })

  return new NextResponse(res.buffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${res.filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
