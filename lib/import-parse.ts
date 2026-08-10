// Shared spreadsheet parsing for imports (.xlsx/.xls/.csv via SheetJS).
// Returns column headers (in file order) + rows as string maps; typed coercion
// happens later in lib/import-coerce.ts so the mapper only deals with strings.

import * as XLSX from "xlsx"

// Loose header comparison: ignore case, spaces, and punctuation.
export function normalizeKey(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[\s_\-().]/g, "")
}

// Stringify a cell for transport to the mapper. Dates → ISO so they re-parse
// reliably; everything else → trimmed string.
function cellToString(v: unknown): string {
  if (v == null) return ""
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString()
  return String(v).trim()
}

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, string>[]
  total: number
}

export const IMPORT_ALLOWED_EXT = ["xlsx", "xls", "csv"]

export function parseSpreadsheet(buffer: Buffer, filename: string, maxRows = 5000): ParsedSheet {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { headers: [], rows: [], total: 0 }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" })
  if (!aoa.length) return { headers: [], rows: [], total: 0 }

  // Header row, in file order. De-duplicate repeated names so mapping keys stay
  // unique (e.g. two "Notes" columns → "Notes", "Notes (2)").
  const seen = new Map<string, number>()
  const headers: string[] = (aoa[0] as unknown[]).map((h) => {
    const name = String(h ?? "").trim()
    if (!name) return ""
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return n === 1 ? name : `${name} (${n})`
  })

  const rows: Record<string, string>[] = []
  for (const raw of aoa.slice(1)) {
    const arr = raw as unknown[]
    const cells = headers.map((_, i) => cellToString(arr[i]))
    if (!cells.some((c) => c !== "")) continue // skip fully-blank rows
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { if (h) obj[h] = cells[i] })
    rows.push(obj)
    if (rows.length >= maxRows) break
  }

  return { headers: headers.filter(Boolean), rows, total: rows.length }
}
