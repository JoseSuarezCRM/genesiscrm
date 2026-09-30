/**
 * The text to the surgeon and the Epic telephone-encounter note, ported
 * verbatim from the original referral-intake HTML tool.
 *
 * Both are assembled from the reviewed fields and nothing else. That is the
 * decision this whole feature rests on: the AI fills fields, a person checks
 * them, and only then does anything reach a surgeon. No sentence here is
 * written by a model.
 *
 * Verbatim is enforced by `scripts/referral-calls-parity.ts`. The CRM's extra
 * fields (admin-added ones flagged "show in surgeon text / Epic note") are
 * appended by the wrappers at the bottom, never by editing these functions.
 */

import type { ReferralCallFields, ReferralCallTextInput } from "./types"

export function buildSurgeonText(f: ReferralCallTextInput): string {
  const L: string[] = []
  if (f.urgent) L.push("URGENT")
  const site = f.referredFrom || "Referral"
  L.push(`${site} call${f.room ? ` - room ${f.room}` : ""}`)
  if (f.callback) L.push(`Phone: ${f.callback}`)
  const nm = [f.first, f.last].filter(Boolean).join(" ")
  if (nm) L.push(`Patient: ${nm}`)
  if (f.dob) L.push(`DOB: ${f.dob}`)
  if (f.patientPhone) L.push(`Pt phone: ${f.patientPhone}`)
  const hpi = f.hpi || f.reason
  if (hpi) { L.push(""); L.push(hpi) }
  if (f.labs) {
    L.push(""); const ls = f.labs.split("\n").map((s) => s.trim()).filter(Boolean)
    if (ls.length === 1) L.push(`Labs/imaging: ${ls[0]}`); else { L.push("Labs/imaging:"); ls.forEach((s) => L.push("- " + s)) }
  }
  const mid: string[] = []
  if (f.pmhx) mid.push(`PMHx: ${f.pmhx}`)
  if (f.meds) mid.push(`Meds: ${f.meds}`)
  if (f.anticoag) mid.push(`Blood thinner: ${f.anticoag}${f.lastDose ? `, last dose ${f.lastDose}` : ""}`)
  if (f.social) f.social.split("\n").map((s) => s.trim()).filter(Boolean).forEach((s) => mid.push(s))
  if (f.dm === "Own") mid.push("Own decision maker")
  else if (f.dm === "POA") mid.push("Has POA" + ([f.poa, f.poaPhone].filter(Boolean).length ? ": " + [f.poa, f.poaPhone].filter(Boolean).join(", ") : ""))
  if (mid.length) { L.push(""); L.push(...mid) }
  if (f.npo) { L.push(""); L.push(/^yes$/i.test(f.npo) ? "NPO" : `NPO since ${f.npo}`) }
  return L.join("\n")
}

export const REC_TEXT: Record<string, string> = { "Outpatient f/u needed": "Outpatient follow-up in clinic", "Clearance requested/pending": "Medical clearance requested/pending", "Planning for surgery": "Planning for surgery", Splint: "Splint", WBAT: "WBAT", NWB: "NWB" }

/**
 * `_when` is kept from the original signature, which never used it either.
 * Dropping it would change nothing but the parity harness's call shape.
 */
export function buildTelNote(f: ReferralCallTextInput, _when?: number): string {
  const L: string[] = []
  L.push(`${f.prov || "___"} is the on-call provider this week.`)
  L.push("")
  L.push("Call details:")
  const nm = [f.first, f.last].filter(Boolean).join(" ")
  const who = [f.caller, f.referredFrom && `${f.caller ? "at " : ""}${f.referredFrom}`].filter(Boolean).join(" ")
  let first = `${f.urgent ? "URGENT. " : ""}Call received${who ? " from " + who : ""}${f.callback ? ` (callback ${f.callback})` : ""}`
  if (nm || f.dob) first += ` regarding ${nm || "patient"}${f.dob ? `, DOB ${f.dob}` : ""}`
  if (f.room) first += `, room ${f.room}`
  L.push(first + ".")
  if (f.patientPhone) L.push(`Patient phone: ${f.patientPhone}`)
  const hpi = f.hpi || f.reason; if (hpi) L.push(hpi)
  if (f.labs) { const ls = f.labs.split("\n").map((s) => s.trim()).filter(Boolean); L.push(`Labs/imaging: ${ls.join("; ")}`) }
  if (f.pmhx) L.push(`PMHx: ${f.pmhx}`)
  if (f.meds) L.push(`Meds: ${f.meds}`)
  if (f.anticoag) L.push(`Blood thinner: ${f.anticoag}${f.lastDose ? `, last dose ${f.lastDose}` : ""}`)
  if (f.npo) L.push(/^yes$/i.test(f.npo) ? "NPO" : `NPO since ${f.npo}`)
  if (f.social) f.social.split("\n").map((s) => s.trim()).filter(Boolean).forEach((s) => L.push(s))
  if (f.dm === "Own") L.push("Own decision maker")
  else if (f.dm === "POA") L.push("Has POA" + ([f.poa, f.poaPhone].filter(Boolean).length ? ": " + [f.poa, f.poaPhone].filter(Boolean).join(", ") : ""))
  L.push("")
  L.push("Recommend:")
  const oc = (f.outcome || "").split(", ").filter(Boolean)
  oc.filter((x) => x !== "Abx").forEach((x) => L.push("- " + (REC_TEXT[x] || x)))
  if (oc.includes("Abx")) L.push("- Abx" + (f.abx ? ": " + f.abx : ""))
  if (f.otherNotes) f.otherNotes.split("\n").map((s) => s.trim()).filter(Boolean).forEach((s) => L.push("- " + s))
  if (!oc.length && !f.otherNotes) L.push("- ")
  L.push("")
  L.push(`Call taken by ${f.prov || "___"}.`)
  return L.join("\n")
}

/* ── CRM additions ─────────────────────────────────────────────────────────── */

/** An admin-added field to include in one of the texts, already formatted. */
export interface ExtraLine {
  label: string
  value: string
}

/**
 * The surgeon text, plus any admin-added fields flagged to appear in it.
 *
 * Appended as their own block at the end rather than woven in, so the ported
 * builder's output is untouched and the parity check keeps meaning something.
 */
export function surgeonTextWithExtras(f: ReferralCallTextInput, extras: ExtraLine[]): string {
  const base = buildSurgeonText(f)
  const lines = extras.filter((e) => e.value.trim()).map((e) => `${e.label}: ${e.value.trim()}`)
  return lines.length ? `${base}\n\n${lines.join("\n")}` : base
}

/**
 * The Epic note, with admin-added fields inserted just before "Recommend:".
 * That is where call details end, which is what these fields are.
 */
export function telNoteWithExtras(f: ReferralCallTextInput, extras: ExtraLine[]): string {
  const base = buildTelNote(f)
  const lines = extras.filter((e) => e.value.trim()).map((e) => `${e.label}: ${e.value.trim()}`)
  if (!lines.length) return base
  const marker = "\n\nRecommend:"
  const at = base.indexOf(marker)
  return at < 0 ? `${base}\n${lines.join("\n")}` : `${base.slice(0, at)}\n${lines.join("\n")}${base.slice(at)}`
}

/**
 * The plain "copy intake" block from the original tool, for pasting a call's
 * identifiers into another system.
 */
export function buildIntakeText(f: ReferralCallFields): string {
  const lines: string[] = []
  if (f.urgent) lines.push("*** URGENT ***")
  lines.push(`Patient first name: ${f.first}`)
  lines.push(`Patient last name: ${f.last}`)
  lines.push(`Patient phone: ${f.patientPhone || "Not indicated"}`)
  lines.push(`Referred from: ${f.referredFrom}`)
  lines.push(`Reason for referral: ${f.reason}`)
  const add: string[] = []
  if (f.caller) add.push(`Caller: ${f.caller}`)
  if (f.callback) add.push(`Callback: ${f.callback}`)
  if (f.room) add.push(`Room: ${f.room}`)
  if (f.dob) add.push(`DOB: ${f.dob}`)
  const notes = [...add, f.notes].filter(Boolean).join("\n")
  lines.push(`Notes:\n${notes || "None"}`)
  return lines.join("\n")
}

