/**
 * The model's answer → form values.
 *
 * The answer is validated against a schema built from the same plan that built
 * the JSON schema, then brought into the exact conventions the ported parser
 * uses — brand-name blood thinners, 555-555-5555 phones, MM/DD/YYYY dates,
 * title-cased capitals — so a field reads the same whichever source filled it.
 *
 * Pure. Never logs: the input is PHI.
 */

import { z } from "zod"
import { RC_OUTCOMES } from "./constants"
import { formatDob, parseDob } from "./dob"
import { titleIfCaps } from "./parse"
import { toggleOutcome } from "./picks"
import { RC_FIELD_MAX, type ExtraValue } from "./snapshot"
import type { ExtractionPlan } from "./ai-prompt"
import type { FieldKey, ReferralCallFields } from "./types"

export interface NormalizedExtraction {
  /** Only the fields the AI was asked to fill. */
  fields: Partial<ReferralCallFields>
  /** Added-property values, keyed by property id. */
  extras: Record<string, ExtraValue>
}

/** zod for the model's answer, mirroring the JSON schema field for field. */
export function answerSchema(plan: ExtractionPlan) {
  const shape: Record<string, z.ZodTypeAny> = {}
  const text = z.string().max(RC_FIELD_MAX)
  for (const b of plan.builtins) {
    shape[b.schemaKey] =
      b.kind === "boolean" ? z.boolean()
        : b.kind === "decisionMaker" ? z.enum(["", "own", "poa"])
        : b.kind === "outcome" ? z.array(z.enum(RC_OUTCOMES.map((o) => o.value) as [string, ...string[]])).max(20)
        : text
  }
  for (const x of plan.extras) {
    const codes = x.options.map((o) => o.code) as [string, ...string[]]
    shape[x.code] =
      x.kind === "boolean" ? z.boolean()
        : x.kind === "dropdown" ? z.enum(["", ...codes] as [string, ...string[]])
        : x.kind === "multi" ? z.array(z.enum(codes)).max(100)
        : text
  }
  return z.object(shape).strict()
}

const PHONE = /^(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})$/
/** A bare 10-digit number as 555-555-5555; anything else (extensions, notes) as written. */
export function normalizePhone(s: string): string {
  const t = s.trim()
  const m = PHONE.exec(t)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : t
}

/** The parser's generic → brand table, so both sources name drugs alike. */
const DRUGS: Record<string, string> = {
  warfarin: "Warfarin", coumadin: "Warfarin", jantoven: "Warfarin", eliquis: "Eliquis", apixaban: "Eliquis",
  xarelto: "Xarelto", rivaroxaban: "Xarelto", pradaxa: "Pradaxa", dabigatran: "Pradaxa", savaysa: "Savaysa",
  edoxaban: "Savaysa", lovenox: "Lovenox", enoxaparin: "Lovenox", heparin: "Heparin", plavix: "Plavix",
  clopidogrel: "Plavix", brilinta: "Brilinta", ticagrelor: "Brilinta", effient: "Effient", prasugrel: "Effient",
  aspirin: "Aspirin", asa: "Aspirin",
}

export function normalizeThinner(s: string): string {
  const t = s.trim()
  if (!t) return ""
  if (/^(no|none|denies|not on)\b/i.test(t)) return "None"
  if (/^yes,? agent not specified$/i.test(t)) return "Yes, agent not specified"
  const out: string[] = []
  for (const part of t.split(/\s*[,;/]\s*|\s+and\s+/i)) {
    const p = part.trim()
    if (!p) continue
    const brand = DRUGS[p.toLowerCase()] ?? DRUGS[p.toLowerCase().split(/\s+/)[0] ?? ""]
    const name = brand ?? p
    if (!out.includes(name)) out.push(name)
  }
  return out.join(", ")
}

const fixAbbr = (s: string) => s.replace(/\b(er|ed|icu|pacu|snf|alf)\b/gi, (m) => m.toUpperCase())

/** A calendar date for an added DATE property, stored at noon UTC. Future dates allowed. */
function extraDate(s: string): string | null {
  const t = s.trim()
  let y: number, m: number, d: number
  const us = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (us) { m = +us[1]!; d = +us[2]!; y = +us[3]! }
  else if (iso) { y = +iso[1]!; m = +iso[2]!; d = +iso[3]! }
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString()
}

/**
 * Validate and normalise. Returns null when the answer doesn't match the
 * schema — the caller reports "couldn't read the answer" and keeps the rules.
 */
export function normalizeAnswer(plan: ExtractionPlan, raw: unknown, now: Date = new Date()): NormalizedExtraction | null {
  const parsed = answerSchema(plan).safeParse(raw)
  if (!parsed.success) return null
  const a = parsed.data as Record<string, unknown>

  const fields: Partial<ReferralCallFields> = {}
  const set = <K extends FieldKey>(k: K, v: ReferralCallFields[K]) => { fields[k] = v }

  for (const b of plan.builtins) {
    const v = a[b.schemaKey]
    if (b.kind === "boolean") { set(b.field as "urgent", v === true); continue }
    if (b.kind === "decisionMaker") { set("dm", v === "own" ? "Own" : v === "poa" ? "POA" : ""); continue }
    if (b.kind === "outcome") {
      let outcome = ""
      const picked = new Set(v as string[])
      // Canonical order; WBAT/NWB exclusive — if the answer has both, it has neither.
      const both = picked.has("wbat") && picked.has("nwb")
      for (const o of RC_OUTCOMES) {
        if (!picked.has(o.value)) continue
        if (both && (o.value === "wbat" || o.value === "nwb")) continue
        outcome = toggleOutcome(outcome, o.label)
      }
      set("outcome", outcome)
      continue
    }
    const s = String(v ?? "").trim()
    switch (b.field) {
      case "first": case "last": set(b.field, titleIfCaps(s)); break
      case "dob": { const ymd = s ? parseDob(s, now) : null; set("dob", ymd ? formatDob(ymd) : ""); break }
      case "callback": case "patientPhone": case "poaPhone": set(b.field, normalizePhone(s)); break
      case "anticoag": set("anticoag", normalizeThinner(s)); break
      case "referredFrom": set("referredFrom", fixAbbr(s)); break
      default: set(b.field as Exclude<FieldKey, "urgent" | "dm">, s)
    }
  }

  // The parser's rules, kept: antibiotics detail implies the Abx outcome, and a
  // patient on no blood thinner has no last dose.
  if (fields.abx && fields.outcome !== undefined && !/\bAbx\b/.test(fields.outcome)) {
    fields.outcome = toggleOutcome(fields.outcome, "Abx")
  }
  if (fields.anticoag === "None" && fields.lastDose !== undefined) fields.lastDose = ""

  const extras: Record<string, ExtraValue> = {}
  for (const x of plan.extras) {
    const v = a[x.code]
    switch (x.kind) {
      case "boolean": extras[x.prop.id] = v === true; break
      case "number": {
        const s = String(v ?? "").replace(/[$,\s]/g, "")
        const n = s ? Number(s) : NaN
        extras[x.prop.id] = Number.isFinite(n) ? n : null
        break
      }
      case "date": extras[x.prop.id] = extraDate(String(v ?? "")); break
      case "dropdown": extras[x.prop.id] = x.options.find((o) => o.code === v)?.value ?? ""; break
      case "multi": {
        const values = (v as string[]).map((c) => x.options.find((o) => o.code === c)?.value).filter((s): s is string => !!s)
        extras[x.prop.id] = Array.from(new Set(values))
        break
      }
      default: extras[x.prop.id] = String(v ?? "").trim()
    }
  }

  return { fields, extras }
}
