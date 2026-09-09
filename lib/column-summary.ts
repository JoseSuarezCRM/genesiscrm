// Per-column totals under a table — "Sum $25,000", "Average 3.2", "12 filled".
//
// The board's column metrics answer the same question for a stage, so the maths lives
// here once and both use it.

export type SummaryAgg = "none" | "sum" | "avg" | "min" | "max" | "count" | "filled" | "empty"

export const SUMMARY_AGGS: { value: SummaryAgg; label: string; numeric: boolean }[] = [
  { value: "none", label: "None", numeric: false },
  { value: "sum", label: "Sum", numeric: true },
  { value: "avg", label: "Average", numeric: true },
  { value: "min", label: "Minimum", numeric: true },
  { value: "max", label: "Maximum", numeric: true },
  { value: "count", label: "Count", numeric: false },
  { value: "filled", label: "Filled", numeric: false },
  { value: "empty", label: "Empty", numeric: false },
]

/** The aggregations that make sense for a column of this type. */
export function aggsFor(isNumeric: boolean): { value: SummaryAgg; label: string }[] {
  return SUMMARY_AGGS.filter((a) => !a.numeric || isNumeric).map((a) => ({ value: a.value, label: a.label }))
}

const isBlank = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)

/** Coerce a bag value to a number — a NUMBER property can hold 8504, "8504" or "$8,504". */
function num(v: unknown): number | null {
  if (typeof v === "number") return isNaN(v) ? null : v
  if (isBlank(v)) return null
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? null : n
}

export interface SummaryResult {
  /** The number to show; null when there's nothing to summarize. */
  value: number | null
  /** True when the result is a money/decimal amount that should use the column's format. */
  formatted: boolean
}

/**
 * Aggregate one column's raw values. Numeric aggregations ignore blanks entirely —
 * an average divides by the rows that actually carry a value, because a blank is not
 * a zero and averaging it in would quietly understate the result.
 */
export function summarize(values: unknown[], agg: SummaryAgg): SummaryResult {
  if (agg === "none") return { value: null, formatted: false }
  if (agg === "count") return { value: values.length, formatted: false }
  if (agg === "filled") return { value: values.filter((v) => !isBlank(v)).length, formatted: false }
  if (agg === "empty") return { value: values.filter(isBlank).length, formatted: false }

  const nums = values.map(num).filter((n): n is number => n !== null)
  if (!nums.length) return { value: null, formatted: true }
  switch (agg) {
    case "sum": return { value: nums.reduce((a, b) => a + b, 0), formatted: true }
    case "avg": return { value: nums.reduce((a, b) => a + b, 0) / nums.length, formatted: true }
    case "min": return { value: Math.min(...nums), formatted: true }
    case "max": return { value: Math.max(...nums), formatted: true }
    default: return { value: null, formatted: false }
  }
}

export function summaryLabel(agg: SummaryAgg): string {
  return SUMMARY_AGGS.find((a) => a.value === agg)?.label ?? ""
}
