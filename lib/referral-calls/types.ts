/**
 * The shape of one referral call, as the intake form holds it.
 *
 * The field names are the original HTML tool's, on purpose: the parser and the
 * text builders are ported verbatim from it, and the parity check compares their
 * output field by field. Anything the CRM needs differently — dates as ISO,
 * outcome as an array — is converted at the edges (`schema.ts`), never here.
 */

export interface ReferralCallFields {
  first: string
  last: string
  /** As the form shows it: MM/DD/YYYY, or whatever was pasted. */
  dob: string
  room: string
  callback: string
  patientPhone: string
  referredFrom: string
  reason: string
  notes: string
  hpi: string
  pmhx: string
  /** Blood thinner, as the chips name them: "Eliquis", "None", … */
  anticoag: string
  lastDose: string
  npo: string
  /** One entry per line. */
  social: string
  caller: string
  dm: "" | "Own" | "POA"
  poa: string
  poaPhone: string
  meds: string
  /** One result per line. */
  labs: string
  /** ", "-joined outcome labels, in the canonical order. */
  outcome: string
  abx: string
  otherNotes: string
  urgent: boolean
}

/** The builders also need the call-taker's initials. */
export interface ReferralCallTextInput extends ReferralCallFields {
  prov: string
}

export function emptyFields(): ReferralCallFields {
  return {
    first: "", last: "", dob: "", room: "", callback: "", patientPhone: "", referredFrom: "",
    reason: "", notes: "", hpi: "", pmhx: "", anticoag: "", lastDose: "", npo: "", social: "",
    caller: "", dm: "", poa: "", poaPhone: "", meds: "", labs: "", outcome: "", abx: "",
    otherNotes: "", urgent: false,
  }
}

/** Every string field, for iterating without repeating the list. */
export const TEXT_FIELD_KEYS = [
  "first", "last", "dob", "room", "callback", "patientPhone", "referredFrom", "reason", "notes",
  "hpi", "pmhx", "anticoag", "lastDose", "npo", "social", "caller", "poa", "poaPhone", "meds",
  "labs", "outcome", "abx", "otherNotes",
] as const satisfies readonly (keyof ReferralCallFields)[]

export type FieldKey = keyof ReferralCallFields
