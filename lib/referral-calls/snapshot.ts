/**
 * A referral call as the intake form holds it, and the conversions to and from
 * the stored record.
 *
 * The form compares two snapshots when it saves — the one it loaded and the one
 * it has now — so the server can write only what this form changed. Both sides
 * therefore need to agree exactly on how a snapshot becomes record values; that
 * conversion lives here, once.
 */

import { z } from "zod"
import { RC_DEFAULT_STATUS, RC_STATUSES, type RcStatus } from "./constants"
import { fieldsToValues, isStatus, valuesToFields, RC_PROP_IDS } from "./schema"
import { emptyFields, type ReferralCallFields } from "./types"

/** Longest value any one field accepts. A long HPI is a few thousand characters. */
export const RC_FIELD_MAX = 20_000

const str = z.string().max(RC_FIELD_MAX)

export const FieldsSchema = z
  .object({
    first: str, last: str, dob: str, room: str, callback: str, patientPhone: str, referredFrom: str,
    reason: str, notes: str, hpi: str, pmhx: str, anticoag: str, lastDose: str, npo: str, social: str,
    caller: str, dm: z.enum(["", "Own", "POA"]), poa: str, poaPhone: str, meds: str, labs: str,
    outcome: str, abx: str, otherNotes: str, urgent: z.boolean(),
  })
  .strict()

/** The value of an admin-added property, in any of the shapes custom objects store. */
export const ExtraValueSchema = z.union([
  z.string().max(RC_FIELD_MAX),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(500)).max(100),
])
export type ExtraValue = z.infer<typeof ExtraValueSchema>

const STATUS_VALUES = RC_STATUSES.map((s) => s.value) as [RcStatus, ...RcStatus[]]

export const SnapshotSchema = z
  .object({
    fields: FieldsSchema,
    status: z.enum(STATUS_VALUES),
    charted: z.boolean(),
    surgeonText: str,
    surgeonTextEdited: z.boolean(),
    epicNote: str,
    epicNoteEdited: z.boolean(),
    sourceText: str,
    /** Values of admin-added properties, keyed by property id. */
    extras: z.record(z.string().max(100), ExtraValueSchema),
  })
  .strict()

export type ReferralCallSnapshot = z.infer<typeof SnapshotSchema>

export const SaveInputSchema = z
  .object({
    recordId: z.string().max(100).optional(),
    ownerId: z.string().max(100).nullable().optional(),
    current: SnapshotSchema,
    /** The snapshot as it was when the form loaded or last saved; absent for a new call. */
    baseline: SnapshotSchema.nullable().optional(),
    /** The owner as it was at that point — so an owner change is applied only if made here. */
    baselineOwnerId: z.string().max(100).nullable().optional(),
  })
  .strict()

export type SaveReferralCallInput = z.infer<typeof SaveInputSchema>

export function emptySnapshot(): ReferralCallSnapshot {
  return {
    fields: emptyFields(),
    status: RC_DEFAULT_STATUS,
    charted: false,
    surgeonText: "",
    surgeonTextEdited: false,
    epicNote: "",
    epicNoteEdited: false,
    sourceText: "",
    extras: {},
  }
}

/**
 * Snapshot → record values. Extras are kept only for `extraIds` — properties
 * that really exist on the object and are not the intake's own — so a crafted
 * key cannot write into a built-in property through the side door.
 */
export function snapshotToValues(s: ReferralCallSnapshot, extraIds: ReadonlySet<string>): Record<string, unknown> {
  const v: Record<string, unknown> = {
    ...fieldsToValues(s.fields as ReferralCallFields),
    status: s.status,
    charted: s.charted,
    surgeon_text: s.surgeonText,
    surgeon_text_edited: s.surgeonTextEdited,
    epic_note: s.epicNote,
    epic_note_edited: s.epicNoteEdited,
    source_text: s.sourceText,
  }
  for (const [k, val] of Object.entries(s.extras)) {
    if (extraIds.has(k) && !RC_PROP_IDS.has(k)) v[k] = val
  }
  return v
}

/** Record values → snapshot. Anything malformed reads as empty. */
export function valuesToSnapshot(values: Record<string, unknown>, extraIds: ReadonlySet<string>): ReferralCallSnapshot {
  const text = (k: string) => (typeof values[k] === "string" ? (values[k] as string) : "")
  const extras: Record<string, ExtraValue> = {}
  for (const id of Array.from(extraIds)) {
    if (RC_PROP_IDS.has(id) || !(id in values)) continue
    const parsed = ExtraValueSchema.safeParse(values[id])
    if (parsed.success) extras[id] = parsed.data
  }
  return {
    fields: valuesToFields(values),
    status: isStatus(values["status"]) ? values["status"] : RC_DEFAULT_STATUS,
    charted: values["charted"] === true,
    surgeonText: text("surgeon_text"),
    surgeonTextEdited: values["surgeon_text_edited"] === true,
    epicNote: text("epic_note"),
    epicNoteEdited: values["epic_note_edited"] === true,
    sourceText: text("source_text"),
    extras,
  }
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * The values to store when a form saves over a record that may have changed
 * since the form loaded it: the stored values, with only the keys THIS form
 * changed (mine differs from base) replaced. A colleague's change to any other
 * key — ticking Charted in the call log, say — survives.
 */
export function mergeFormChanges(
  stored: Record<string, unknown>,
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...stored }
  for (const [k, v] of Object.entries(mine)) if (!sameValue(v, base[k])) next[k] = v
  return next
}

/** Keys whose value differs between two value maps (for triggers and the audit log). */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  return Array.from(keys).filter((k) => !sameValue(before[k], after[k]))
}
