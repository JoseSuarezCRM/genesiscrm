/**
 * Values a referral call computes rather than takes from the client.
 *
 * Runs on every write — the intake's save and an inline edit in the call log —
 * so the stored record is always consistent with itself: the title matches the
 * fields, "Charted by" is whoever actually ticked the box, and the texts match
 * the fields they were built from unless someone deliberately edited them.
 */

import { RC_DEFAULT_STATUS } from "./constants"
import { computeCallTitle, isStatus, valuesToFields, type RcPropId } from "./schema"
import { surgeonTextWithExtras, telNoteWithExtras, type ExtraLine } from "./text"

type Values = Record<string, unknown>

export interface DeriveContext {
  /** Initials of the person making this change — becomes "Charted by". */
  actorInitials: string
  /** Initials of the call-taker (the record owner) — go into the Epic note. */
  ownerInitials: string
  now: Date
  /** Admin-added fields flagged to appear in each text. */
  surgeonExtras?: ExtraLine[]
  noteExtras?: ExtraLine[]
}

/**
 * `prev` is the stored record (empty for a new call); `next` is it with the
 * incoming change applied. Returns `next` with the derived fields set.
 */
export function deriveReferralCallValues(prev: Values, next: Values, ctx: DeriveContext): Values {
  const out: Values = { ...next }
  const fields = valuesToFields(out)

  out["call_title" satisfies RcPropId] = computeCallTitle(fields)

  if (!isStatus(out["status"])) out["status"] = RC_DEFAULT_STATUS
  if (out["status"] !== prev["status"]) out["status_changed_at"] = ctx.now.toISOString()

  // Charted by / at follow the checkbox, and are never taken from the client:
  // they answer "who confirmed this is in Epic", which only the server knows.
  const wasCharted = prev["charted"] === true
  const isCharted = out["charted"] === true
  if (isCharted && !wasCharted) {
    out["charted_by"] = ctx.actorInitials
    out["charted_at"] = ctx.now.toISOString()
  } else if (!isCharted) {
    out["charted_by"] = ""
    out["charted_at"] = null
  } else {
    out["charted_by"] = prev["charted_by"] ?? ""
    out["charted_at"] = prev["charted_at"] ?? null
  }

  const textInput = { ...fields, prov: ctx.ownerInitials }
  if (out["surgeon_text_edited"] !== true) {
    out["surgeon_text"] = surgeonTextWithExtras(textInput, ctx.surgeonExtras ?? [])
  }
  if (out["epic_note_edited"] !== true) {
    out["epic_note"] = telNoteWithExtras(textInput, ctx.noteExtras ?? [])
  }

  return out
}
