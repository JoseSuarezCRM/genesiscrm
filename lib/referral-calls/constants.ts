/**
 * Fixed values for the referral-call intake. Client-safe: no server imports.
 *
 * The option VALUES here are stored on records and filtered on, and the
 * property lock (`lib/custom-object-locks.ts`) stops an admin removing them.
 * Labels can be renamed in Settings without breaking anything; values cannot.
 */

export const RC_OBJECT_KEY = "referral-calls"

/** The permission key custom objects use: "CO:<key>". */
export const RC_PERM_KEY = `CO:${RC_OBJECT_KEY}`

export const RC_STATUSES = [
  { value: "sent_to_surgeon", label: "Text sent to surgeon" },
  { value: "accepted", label: "Accepted case" },
  { value: "transferred", label: "Transferred to another specialty/hospital" },
  { value: "outpatient_followup", label: "Outpatient f/u needed" },
] as const

export type RcStatus = (typeof RC_STATUSES)[number]["value"]
export const RC_DEFAULT_STATUS: RcStatus = "sent_to_surgeon"

/**
 * Outcome picks, in the original tool's canonical order — the order its parser
 * sorts them into and its Epic note lists them in.
 */
export const RC_OUTCOMES = [
  { value: "outpatient_fu", label: "Outpatient f/u needed" },
  { value: "clearance", label: "Clearance requested/pending" },
  { value: "planning_surgery", label: "Planning for surgery" },
  { value: "splint", label: "Splint" },
  { value: "wbat", label: "WBAT" },
  { value: "nwb", label: "NWB" },
  { value: "abx", label: "Abx" },
] as const

export const RC_OUTCOME_LABELS: readonly string[] = RC_OUTCOMES.map((o) => o.label)

/** WBAT and NWB contradict each other; picking one clears the other. */
export const RC_WEIGHT_BEARING = ["WBAT", "NWB"] as const

export const RC_DECISION_MAKERS = [
  { value: "own", label: "Own decision maker", field: "Own" },
  { value: "poa", label: "Has POA", field: "POA" },
] as const

/** Quick picks for the blood-thinner field. "None" also clears the last dose. */
export const RC_BLOOD_THINNER_PICKS = ["None", "Aspirin", "Plavix", "Eliquis", "Xarelto", "Warfarin", "Lovenox"] as const

/** Toggle chips for the social/historian field, one line each. */
export const RC_SOCIAL_PICKS = [
  "Own historian", "Limited historian", "Lives alone", "Lives with family",
  "From SNF/ALF", "Ambulatory at baseline", "Uses walker",
] as const

/**
 * The model that reads calls. Opus 5.5 at low effort: the task is fully
 * specified extraction, and staff are waiting on it.
 */
export const RC_EXTRACT_MODEL = "claude-opus-5-5"

/** How many AI-filled fields an admin may add on top of the built-in ones. */
export const RC_MAX_EXTRA_AI_FIELDS = 20
