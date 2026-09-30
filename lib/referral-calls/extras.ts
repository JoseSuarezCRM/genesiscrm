/**
 * Admin-added fields on the call log — the ones an admin creates in Settings →
 * Custom Objects and configures on the On-call AI page.
 *
 * Pure: used by the intake (to rebuild the texts live) and by the save action
 * (to rebuild them authoritatively), so both produce the same text.
 */

import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import { CLINIC_TZ } from "@/lib/tz"
import { isoToDob } from "./dob"
import { RC_PROP_IDS } from "./schema"
import type { ExtraLine } from "./text"
import type { ExtraValue } from "./snapshot"

/** One field's saved AI rule. Every flag is optional; absent means off / default. */
export interface FieldRule {
  /** What the AI should pull into this field, in the admin's words. */
  instruction?: string
  /** Built-ins: false turns AI filling off. Added fields: true turns it on. */
  extract?: boolean
  /** Added fields only: append "Label: value" to the text to the surgeon. */
  inSurgeonText?: boolean
  /** Added fields only: add "Label: value" to the Epic note. */
  inEpicNote?: boolean
}

export type FieldRules = Record<string, FieldRule>

/** Types a value can be written into from a paste. USER and DATE_TIME can't. */
export const AI_FILLABLE_TYPES: ReadonlySet<CustomObjectProperty["type"]> = new Set<CustomObjectProperty["type"]>([
  "TEXT", "LONG_TEXT", "NUMBER", "EMAIL", "PHONE", "URL", "DATE", "CHECKBOX", "DROPDOWN", "MULTI_SELECT",
])

/** Types a text line can show without looking anything up. */
export const TEXT_SHOWABLE_TYPES: ReadonlySet<CustomObjectProperty["type"]> = new Set<CustomObjectProperty["type"]>([
  "TEXT", "LONG_TEXT", "NUMBER", "EMAIL", "PHONE", "URL", "DATE", "DATE_TIME", "CHECKBOX", "DROPDOWN", "MULTI_SELECT",
])

/** The object's properties that are not the intake's own, in their order. */
export function addedProperties(properties: CustomObjectProperty[]): CustomObjectProperty[] {
  return properties.filter((p) => !RC_PROP_IDS.has(p.id))
}

/** Parse the stored rules JSON defensively: anything unexpected is dropped. */
export function parseFieldRules(raw: unknown): FieldRules {
  const out: FieldRules = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [id, r] of Object.entries(raw as Record<string, unknown>)) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue
    const o = r as Record<string, unknown>
    const rule: FieldRule = {}
    if (typeof o.instruction === "string") rule.instruction = o.instruction
    if (typeof o.extract === "boolean") rule.extract = o.extract
    if (typeof o.inSurgeonText === "boolean") rule.inSurgeonText = o.inSurgeonText
    if (typeof o.inEpicNote === "boolean") rule.inEpicNote = o.inEpicNote
    out[id] = rule
  }
  return out
}

const optionLabel = (p: CustomObjectProperty, v: string) => p.optionLabels?.[v] ?? v

/** A property value as a line of text. Empty when there is nothing worth showing. */
export function formatExtraValue(p: CustomObjectProperty, v: unknown): string {
  if (v === null || v === undefined) return ""
  switch (p.type) {
    case "NUMBER":
      return typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v.trim() : ""
    case "DATE":
      return isoToDob(v)
    case "DATE_TIME": {
      const d = typeof v === "string" ? new Date(v) : null
      if (!d || Number.isNaN(d.getTime())) return ""
      return new Intl.DateTimeFormat("en-US", {
        timeZone: CLINIC_TZ, month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit",
      }).format(d)
    }
    case "CHECKBOX":
      // Unticked is the default, not an answer — only a tick is worth a line.
      return v === true ? "Yes" : ""
    case "DROPDOWN":
      return typeof v === "string" && v ? optionLabel(p, v) : ""
    case "MULTI_SELECT":
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x).map((x) => optionLabel(p, x)).join(", ") : ""
    case "USER":
      return ""
    default:
      return typeof v === "string" ? v.trim() : ""
  }
}

/** The extra lines each text gets, from the added fields flagged to show in it. */
export function textExtrasFor(
  properties: CustomObjectProperty[],
  rules: FieldRules,
  values: Record<string, unknown>,
): { surgeon: ExtraLine[]; note: ExtraLine[] } {
  const surgeon: ExtraLine[] = []
  const note: ExtraLine[] = []
  for (const p of addedProperties(properties)) {
    const r = rules[p.id]
    if (!r?.inSurgeonText && !r?.inEpicNote) continue
    if (!TEXT_SHOWABLE_TYPES.has(p.type)) continue
    const value = formatExtraValue(p, values[p.id])
    if (!value) continue
    const line = { label: p.name, value }
    if (r.inSurgeonText) surgeon.push(line)
    if (r.inEpicNote) note.push(line)
  }
  return { surgeon, note }
}

/**
 * An incoming value for an added property, checked against its type and
 * normalised for storage. `undefined` means "not acceptable for this type".
 */
export function coerceExtraValue(p: CustomObjectProperty, v: ExtraValue): ExtraValue | undefined {
  if (v === null) return null
  switch (p.type) {
    case "NUMBER":
      if (typeof v === "number") return v
      if (typeof v === "string") {
        if (!v.trim()) return null
        const n = Number(v.replace(/[$,\s]/g, ""))
        return Number.isFinite(n) ? n : undefined
      }
      return undefined
    case "CHECKBOX":
      return typeof v === "boolean" ? v : undefined
    case "DATE": {
      if (typeof v !== "string") return undefined
      if (!v.trim()) return null
      // Calendar days are stored at noon UTC (see clinicDateOnlyValue in lib/tz).
      // The shared DatePicker emits UTC midnight; stored values are noon.
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(?:00|12):00:00(?:\.000)?Z)?$/.exec(v.trim())
      if (!m) return undefined
      const [y, mo, d] = [+m[1]!, +m[2]!, +m[3]!]
      const dt = new Date(Date.UTC(y, mo - 1, d, 12))
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined
      return dt.toISOString()
    }
    case "DATE_TIME": {
      if (typeof v !== "string") return undefined
      if (!v.trim()) return null
      const dt = new Date(v)
      return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString()
    }
    case "DROPDOWN":
      if (typeof v !== "string") return undefined
      return v === "" || (p.options ?? []).includes(v) ? v : undefined
    case "MULTI_SELECT":
      if (!Array.isArray(v)) return undefined
      return v.every((x) => (p.options ?? []).includes(x)) ? v : undefined
    case "USER":
      return typeof v === "string" ? v : undefined
    default:
      return typeof v === "string" ? v : undefined
  }
}
