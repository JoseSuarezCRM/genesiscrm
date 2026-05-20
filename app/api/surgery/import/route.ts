import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import * as XLSX from "xlsx"

function normalizeKey(s: string) {
  return s.toLowerCase().replace(/[\s_\-().]/g, "")
}

function findCol(row: Record<string, unknown>, ...names: string[]): string {
  const keys = Object.keys(row)
  for (const name of names) {
    const match = keys.find((k) => normalizeKey(k) === normalizeKey(name))
    if (match !== undefined) {
      const val = row[match]
      // Excel may parse large numeric MRNs as floats — convert to integer string
      if (typeof val === "number") return String(Math.round(val))
      return String(val ?? "").trim()
    }
  }
  return ""
}

function parseExcelDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d
}

// Compound dedup key: MRN + normalized diagnosis
function dedupKey(mrn: string, diagnosis: string) {
  return `${mrn.toLowerCase().trim()}|${diagnosis.toLowerCase().trim()}`
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
    return NextResponse.json({ error: "Only .xlsx, .xls, or .csv files are supported" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

  if (rows.length === 0) return NextResponse.json({ error: "File has no data rows" }, { status: 400 })

  // Build set of existing MRN+Diagnosis pairs for dedup
  const existing = await (prisma as any).surgeryCase.findMany({
    select: { mrn: true, diagnosis: true },
  }) as { mrn: string | null; diagnosis: string | null }[]

  const existingKeys = new Set(
    existing
      .filter((r) => r.mrn)
      .map((r) => dedupKey(r.mrn!, r.diagnosis ?? ""))
  )

  // Also track keys seen within this file to catch in-file duplicates
  const seenKeys = new Set<string>()

  let imported = 0
  let duplicates = 0
  const errors: string[] = []

  for (const row of rows) {
    const patientName = findCol(row, "pt name", "ptname", "patient name", "patientname", "patient", "name", "full name")
    if (!patientName) {
      errors.push(`Skipped row: no patient name found`)
      continue
    }

    const mrn = findCol(row, "mrn", "medical record number", "patient mrn")
    const diagnosis = findCol(row, "diagnosis", "dx", "icd", "diagnosis code")
    const key = dedupKey(mrn, diagnosis)

    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicates++
      errors.push(`"${patientName}" (MRN: ${mrn}, Dx: ${diagnosis || "—"}): duplicate — skipped`)
      continue
    }
    seenKeys.add(key)

    try {
      await (prisma as any).surgeryCase.create({
        data: {
          mrn: mrn || null,
          expires: parseExcelDate(
            row[Object.keys(row).find((k) => normalizeKey(k) === "expires" || normalizeKey(k) === "expiration" || normalizeKey(k) === "expiry") ?? ""]
          ),
          creationDate: parseExcelDate(
            row[Object.keys(row).find((k) => ["creationdate", "createddate", "createdate", "date"].includes(normalizeKey(k))) ?? ""]
          ),
          status: "NEW",
          patientName,
          orderingProvider: findCol(row, "ordering provider", "orderingprovider", "ordering dr", "ordering physician", "provider") || null,
          diagnosis: diagnosis || null,
          createdById: session.user.id,
        },
      })
      imported++
    } catch (e: any) {
      errors.push(`"${patientName}": ${e.message}`)
    }
  }

  return NextResponse.json({ imported, duplicates, errors, total: rows.length })
}
