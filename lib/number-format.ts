// Formatting for NUMBER properties. A property can opt into currency display
// (numberFormat === "currency"); otherwise numbers render as grouped decimals.

export type NumberFormat = "currency" | undefined | null

export function formatCurrency(v: number | string): string {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""))
  if (!isFinite(n)) return String(v)
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

// Render a numeric value for display, honoring the property's chosen format.
export function formatNumber(v: number | string, format?: NumberFormat): string {
  if (v === null || v === undefined || v === "") return String(v ?? "")
  if (format === "currency") return formatCurrency(v)
  const n = typeof v === "number" ? v : Number(v)
  return isFinite(n) ? n.toLocaleString("en-US") : String(v)
}
