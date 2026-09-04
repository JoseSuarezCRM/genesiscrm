// Reading a stored date value for comparison.
//
// Date properties live in a schemaless JSON bag and are NOT stored in one shape:
// values written by the app are ISO ("2026-08-24T00:00:00.000Z"), imported ones can be
// US calendar strings ("07/15/2026"). Both are read from their literal y/m/d parts —
// never rebuilt through `new Date()` for a calendar day, which is what shifts a date
// by one once the viewer's timezone and the display timezone disagree.

/** Whole-day number (days since epoch) for a calendar value; null when unreadable. */
export function dayNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return Math.floor(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / 864e5)
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (us) return Math.floor(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])) / 864e5)
  const d = new Date(v as any)
  return isNaN(d.getTime()) ? null : Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)
}

/**
 * A number a date column can be SORTED by. Calendar days compare by day; a real
 * timestamp keeps its time so a datetime column orders within a day too.
 * Empty/unreadable values sort last in ascending order.
 */
export function dateSortValue(v: unknown, withTime = false): number {
  if (v === null || v === undefined || v === "") return Number.MAX_SAFE_INTEGER
  if (withTime) {
    const t = new Date(v as any).getTime()
    if (!isNaN(t)) return t
  }
  const day = dayNumber(v)
  return day == null ? Number.MAX_SAFE_INTEGER : day * 864e5
}

/** A number a numeric column can be sorted by — tolerates "8504", "$8,504" and 8504. */
export function numberSortValue(v: unknown): number {
  if (v === null || v === undefined || v === "") return Number.MAX_SAFE_INTEGER
  if (typeof v === "number") return v
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}
