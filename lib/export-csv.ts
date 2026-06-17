// Shared CSV helpers so every export button behaves the same way.

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))]
  return lines.join("\r\n")
}

export function downloadCsv(filename: string, csv: string) {
  // UTF-8 BOM so Excel/Sheets read accents correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
