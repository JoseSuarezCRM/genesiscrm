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
    if (match !== undefined) return String(row[match] ?? "").trim()
  }
  return ""
}

function parseExcelDate(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d
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

  let imported = 0
  const errors: string[] = []

  for (const row of rows) {
    const patientName = findCol(row, "patient name", "patientname", "patient", "name", "full name")
    if (!patientName) {
      errors.push(`Skipped row: no patient name found`)
      continue
    }

    try {
      await (prisma as any).surgeryCase.create({
        data: {
          mrn: findCol(row, "mrn", "medical record number", "patient mrn") || null,
          expires: parseExcelDate(
            row[Object.keys(row).find((k) => normalizeKey(k) === "expires" || normalizeKey(k) === "expiration" || normalizeKey(k) === "expiry") ?? ""]
          ),
          creationDate: parseExcelDate(
            row[Object.keys(row).find((k) => ["creationdate", "createddate", "createdate", "date"].includes(normalizeKey(k))) ?? ""]
          ),
          status: "NEW",
          patientName,
          diagnosis: findCol(row, "diagnosis", "dx", "icd", "diagnosis code") || null,
          createdById: session.user.id,
        },
      })
      imported++
    } catch (e: any) {
      errors.push(`"${patientName}": ${e.message}`)
    }
  }

  return NextResponse.json({ imported, errors, total: rows.length })
}
