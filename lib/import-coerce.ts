// Server-side coercion of an imported string cell into the typed value a property
// stores. Mirrors the client editors in components/custom-property-field.tsx and
// the option value/label handling in lib/custom-options.ts.
//
// An empty cell yields { skip: true } — we never overwrite an existing value with
// a blank on update, and never write empty fields on create.

import { optionItems } from "@/lib/custom-options"

export type CoerceResult = { value: unknown } | { skip: true } | { error: string }

const TRUE_SET = new Set(["true", "yes", "y", "1", "x", "✓", "checked", "on"])
const FALSE_SET = new Set(["false", "no", "n", "0", "", "unchecked", "off"])

// Build a case-insensitive lookup from a dropdown cell (value OR display label)
// back to the stored internal value.
function optionResolver(options?: string[] | null, optionLabels?: Record<string, string> | null | unknown) {
  const items = optionItems(options, optionLabels)
  const byKey = new Map<string, string>()
  for (const it of items) {
    byKey.set(it.value.toLowerCase().trim(), it.value)
    byKey.set(it.label.toLowerCase().trim(), it.value)
  }
  return (raw: string): string | null => byKey.get(raw.toLowerCase().trim()) ?? null
}

export function coerceValue(
  type: string,
  raw: string,
  opts?: { options?: string[] | null; optionLabels?: Record<string, string> | null | unknown },
): CoerceResult {
  const s = (raw ?? "").trim()
  if (s === "") return { skip: true }

  switch (type) {
    case "NUMBER": {
      const n = Number(s.replace(/,/g, ""))
      return isNaN(n) ? { error: `"${raw}" is not a number` } : { value: n }
    }
    case "CHECKBOX": {
      const l = s.toLowerCase()
      if (TRUE_SET.has(l)) return { value: true }
      if (FALSE_SET.has(l)) return { value: false }
      return { error: `"${raw}" is not a yes/no value` }
    }
    case "DATE":
    case "DATE_TIME": {
      const d = new Date(s)
      return isNaN(d.getTime()) ? { error: `"${raw}" is not a valid date` } : { value: d.toISOString() }
    }
    case "DROPDOWN": {
      const resolve = optionResolver(opts?.options, opts?.optionLabels)
      const v = resolve(s)
      return v === null ? { error: `"${raw}" is not a valid option` } : { value: v }
    }
    case "MULTI_SELECT": {
      const resolve = optionResolver(opts?.options, opts?.optionLabels)
      const parts = s.split(/[;,]/).map((p) => p.trim()).filter(Boolean)
      const out: string[] = []
      const bad: string[] = []
      for (const p of parts) {
        const v = resolve(p)
        if (v === null) bad.push(p)
        else out.push(v)
      }
      if (bad.length) return { error: `Unknown option(s): ${bad.join(", ")}` }
      return { value: out }
    }
    // TEXT, LONG_TEXT, EMAIL, PHONE, URL and anything else → trimmed string.
    default:
      return { value: s }
  }
}
