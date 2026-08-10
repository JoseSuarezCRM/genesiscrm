// Dropdown / multi-select options store a stable internal VALUE (what records
// keep). `optionLabels` maps value -> display label. A value with no entry shows
// as itself, so pre-existing options (where value == label) just work and no
// record data ever needs migrating.

export interface OptionItem { value: string; label: string }

export function optionItems(options: string[] | undefined | null, optionLabels?: Record<string, string> | null | unknown): OptionItem[] {
  const labels = (optionLabels ?? {}) as Record<string, string>
  return (options ?? []).map((v) => ({ value: v, label: labels[v] ?? v }))
}

// Display label for a single stored value (string, or array for multi-select).
export function optionLabelFor(value: unknown, optionLabels?: Record<string, string> | null | unknown): string {
  const labels = (optionLabels ?? {}) as Record<string, string>
  if (Array.isArray(value)) return value.map((v) => labels[String(v)] ?? String(v)).join(", ")
  if (value == null) return ""
  return labels[String(value)] ?? String(value)
}

// Plain-text rendering of a dropdown/multi-select value — for sorting + CSV export
// (the styled UI uses <OptionValue> instead). Alias of optionLabelFor.
export function optionText(value: unknown, optionLabels?: Record<string, string> | null | unknown): string {
  return optionLabelFor(value, optionLabels)
}
