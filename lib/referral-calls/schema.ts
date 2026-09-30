/**
 * The "Referral Calls" object: its properties, and the mapping between the
 * intake form and a stored record.
 *
 * Property ids are permanent. The intake reads and writes by id, message tokens
 * use them (internalName = id), and saved filters reference them — so an admin
 * may rename "Callback" to "Call-back number" freely, but the id stays
 * `callback` forever. The lock enforces that.
 *
 * Phone numbers are TEXT, never PHONE. A PHONE property makes the record's
 * activity feed pull in every SMS thread with a matching number, which for an
 * ER callback line would surface unrelated patients' texts on this call.
 */

import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import { RC_DECISION_MAKERS, RC_OUTCOMES, RC_STATUSES, RC_DEFAULT_STATUS } from "./constants"
import { dobToIso, isoToDob } from "./dob"
import { emptyFields, type FieldKey, type ReferralCallFields } from "./types"

const LOCK_NOTE = "Used by the On-call intake. Rename freely; the type and options are fixed."

function prop(
  id: string,
  name: string,
  type: CustomObjectProperty["type"],
  extra: Partial<CustomObjectProperty> = {},
): CustomObjectProperty {
  return { id, name, type, internalName: id, description: LOCK_NOTE, locked: true, ...extra }
}

function options(list: readonly { value: string; label: string }[]) {
  return {
    options: list.map((o) => o.value),
    optionLabels: Object.fromEntries(list.map((o) => [o.value, o.label])),
  }
}

/** Every property the intake owns, in display order. */
export const RC_PROPERTIES: CustomObjectProperty[] = [
  prop("call_title", "Call", "TEXT", { primary: true }),
  prop("status", "Status", "DROPDOWN", {
    ...options(RC_STATUSES),
    defaultValue: RC_DEFAULT_STATUS,
    optionStyle: "badge",
  }),
  prop("status_changed_at", "Status changed", "DATE_TIME"),
  prop("urgent", "Urgent", "CHECKBOX"),
  prop("referred_from", "Referred from", "TEXT"),
  prop("room", "Room", "TEXT"),
  prop("caller", "Caller", "TEXT"),
  prop("callback", "Callback", "TEXT"),
  prop("reason", "Reason for referral", "TEXT"),
  prop("notes", "Notes", "LONG_TEXT"),
  prop("first_name", "Patient first name", "TEXT"),
  prop("last_name", "Patient last name", "TEXT"),
  prop("dob", "DOB", "DATE"),
  prop("patient_phone", "Patient phone", "TEXT"),
  prop("hpi", "Short HPI", "LONG_TEXT"),
  prop("labs_imaging", "Pertinent labs / imaging", "LONG_TEXT"),
  prop("pmhx", "PMHx", "LONG_TEXT"),
  prop("meds", "Meds", "LONG_TEXT"),
  prop("blood_thinner", "Blood thinner", "TEXT"),
  prop("blood_thinner_last_dose", "Last dose", "TEXT"),
  prop("npo_since", "NPO since", "TEXT"),
  prop("social", "Social / historian", "LONG_TEXT"),
  prop("decision_maker", "Decision maker", "DROPDOWN", options(RC_DECISION_MAKERS)),
  prop("poa_name", "POA name / relationship", "TEXT"),
  prop("poa_phone", "POA phone", "TEXT"),
  prop("outcome", "Outcome", "MULTI_SELECT", options(RC_OUTCOMES)),
  prop("abx_detail", "Abx", "TEXT"),
  prop("other_notes", "Other notes", "LONG_TEXT"),
  prop("surgeon_text", "Text to surgeon", "LONG_TEXT"),
  prop("surgeon_text_edited", "Surgeon text edited by hand", "CHECKBOX"),
  prop("epic_note", "Epic telephone note", "LONG_TEXT"),
  prop("epic_note_edited", "Epic note edited by hand", "CHECKBOX"),
  prop("charted", "Charted in Epic", "CHECKBOX"),
  prop("charted_by", "Charted by", "TEXT"),
  prop("charted_at", "Charted at", "DATE_TIME"),
  prop("source_text", "Pasted message", "LONG_TEXT"),
]

export type RcPropId =
  | "call_title" | "status" | "status_changed_at" | "urgent" | "referred_from" | "room"
  | "caller" | "callback" | "reason" | "notes" | "first_name" | "last_name" | "dob"
  | "patient_phone" | "hpi" | "labs_imaging" | "pmhx" | "meds" | "blood_thinner"
  | "blood_thinner_last_dose" | "npo_since" | "social" | "decision_maker" | "poa_name"
  | "poa_phone" | "outcome" | "abx_detail" | "other_notes" | "surgeon_text"
  | "surgeon_text_edited" | "epic_note" | "epic_note_edited" | "charted" | "charted_by"
  | "charted_at" | "source_text"

export const RC_PROP_IDS: ReadonlySet<string> = new Set(RC_PROPERTIES.map((p) => p.id))

/** Which record property each form field is stored in. */
export const FIELD_TO_PROP: Record<FieldKey, RcPropId> = {
  first: "first_name", last: "last_name", dob: "dob", room: "room", callback: "callback",
  patientPhone: "patient_phone", referredFrom: "referred_from", reason: "reason", notes: "notes",
  hpi: "hpi", pmhx: "pmhx", anticoag: "blood_thinner", lastDose: "blood_thinner_last_dose",
  npo: "npo_since", social: "social", caller: "caller", dm: "decision_maker", poa: "poa_name",
  poaPhone: "poa_phone", meds: "meds", labs: "labs_imaging", outcome: "outcome",
  abx: "abx_detail", otherNotes: "other_notes", urgent: "urgent",
}

const OUTCOME_VALUE_BY_LABEL = new Map<string, string>(RC_OUTCOMES.map((o) => [o.label.toLowerCase(), o.value]))
const OUTCOME_LABEL_BY_VALUE = new Map<string, string>(RC_OUTCOMES.map((o) => [o.value, o.label]))

/** ", "-joined labels (the form's shape) → option values (the record's shape). */
export function outcomeToValues(outcome: string): string[] {
  return outcome
    .split(",")
    .map((s) => OUTCOME_VALUE_BY_LABEL.get(s.trim().toLowerCase()))
    .filter((v): v is string => !!v)
}

/** Option values → ", "-joined labels, in the canonical order. */
export function valuesToOutcome(values: unknown): string {
  if (!Array.isArray(values)) return ""
  const set = new Set(values.map(String))
  return RC_OUTCOMES.filter((o) => set.has(o.value)).map((o) => o.label).join(", ")
}

/**
 * Form fields → record values, for the intake's own properties only. Values of
 * admin-added properties are passed through by the caller untouched.
 *
 * DOB is stored only when it is a real past date; an invalid one is left out
 * and reported by the save action rather than silently kept as text.
 */
export function fieldsToValues(f: ReferralCallFields): Partial<Record<RcPropId, unknown>> {
  const v: Partial<Record<RcPropId, unknown>> = {}
  for (const key of Object.keys(FIELD_TO_PROP) as FieldKey[]) {
    const id = FIELD_TO_PROP[key]
    const raw = f[key]
    if (key === "dob") v[id] = typeof raw === "string" && raw.trim() ? dobToIso(raw) : null
    else if (key === "outcome") v[id] = outcomeToValues(String(raw))
    else if (key === "dm") v[id] = RC_DECISION_MAKERS.find((d) => d.field === raw)?.value ?? ""
    else if (key === "urgent") v[id] = raw === true
    else v[id] = typeof raw === "string" ? raw.trim() : ""
  }
  return v
}

/** Record values → form fields. Unknown or malformed values read as empty. */
export function valuesToFields(values: Record<string, unknown>): ReferralCallFields {
  const f = emptyFields()
  for (const key of Object.keys(FIELD_TO_PROP) as FieldKey[]) {
    const raw = values[FIELD_TO_PROP[key]]
    if (key === "dob") f.dob = isoToDob(raw)
    else if (key === "outcome") f.outcome = valuesToOutcome(raw)
    else if (key === "dm") f.dm = RC_DECISION_MAKERS.find((d) => d.value === raw)?.field ?? ""
    else if (key === "urgent") f.urgent = raw === true
    else (f as unknown as Record<string, string>)[key] = typeof raw === "string" ? raw : ""
  }
  return f
}

/**
 * The record's display name. ER calls often come without a patient name, so
 * the list would otherwise be a column of "Untitled"; site and reason together
 * are what staff actually recognise a call by.
 */
export function computeCallTitle(f: Pick<ReferralCallFields, "referredFrom" | "reason">): string {
  const parts = [f.referredFrom.trim(), f.reason.trim()].filter(Boolean)
  return parts.length ? parts.join(" – ") : "Referral call"
}

/** A status value, if it is one of ours. */
export function isStatus(v: unknown): v is (typeof RC_STATUSES)[number]["value"] {
  return typeof v === "string" && RC_STATUSES.some((s) => s.value === v)
}

export { OUTCOME_LABEL_BY_VALUE }
