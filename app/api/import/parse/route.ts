import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { parseSpreadsheet, IMPORT_ALLOWED_EXT } from "@/lib/import-parse"

// Parse an uploaded .csv/.xlsx/.xls into { headers, rows } for the import mapper.
// Any signed-in user may parse; the actual write is gated per-object at import time.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!IMPORT_ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: "Only .xlsx, .xls, or .csv files are supported." }, { status: 400 })
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 15 MB." }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = parseSpreadsheet(buffer, file.name)
    if (!parsed.headers.length) return NextResponse.json({ error: "No columns found in the file." }, { status: 400 })
    if (!parsed.rows.length) return NextResponse.json({ error: "The file has no data rows." }, { status: 400 })
    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({ error: `Couldn't read the file: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 })
  }
}
