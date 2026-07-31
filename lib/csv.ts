// Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas/newlines,
// escaped quotes, and a BOM). Returns headers + row objects keyed by header.
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const s = (text ?? "").replace(/^﻿/, "")
  const records: string[][] = []
  let field = "", row: string[] = [], inQuotes = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ",") { row.push(field); field = "" }
      else if (c === "\n") { row.push(field); records.push(row); row = []; field = "" }
      else if (c === "\r") { /* ignore CR */ }
      else field += c
    }
  }
  if (field.length || row.length) { row.push(field); records.push(row) }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const headers = nonEmpty[0].map((h) => h.trim())
  const rows = nonEmpty.slice(1).map((cells) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? "").trim() })
    return obj
  })
  return { headers, rows }
}

// Glob (only `*`) → case-insensitive test, e.g. "SFTPsalesforce*.csv".
export function matchGlob(name: string, pattern: string): boolean {
  if (!pattern) return true
  const rx = new RegExp("^" + pattern.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i")
  return rx.test(name)
}
