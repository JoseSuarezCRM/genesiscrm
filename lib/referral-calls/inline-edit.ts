/**
 * A referral call edited one field at a time — in the call log's table, on its
 * detail page, or by changing its owner — goes through the same derivation as
 * the intake's save: the title follows the fields, ticking Charted records who
 * and when, and the texts rebuild unless someone edited them by hand.
 * Server-only.
 */

import { prisma } from "@/lib/prisma"
import { deriveReferralCallValues } from "./derive"
import { getReferralCallDef } from "./provision"
import { getExtractionProfile } from "./profile"
import { textExtrasFor } from "./extras"
import { initialsFor } from "./initials"

type Values = Record<string, unknown>

/** Set by the server from other fields; an edit to one of these would be overwritten. */
export const RC_SERVER_SET_PROPS: ReadonlySet<string> = new Set([
  "call_title", "status_changed_at", "charted_by", "charted_at", "surgeon_text_edited", "epic_note_edited",
])

/**
 * `next` is the stored values with the edit applied. Editing a text by hand
 * marks it hand-edited, so it stops rebuilding from the fields.
 */
export async function deriveReferralCallEdit(opts: {
  stored: Values
  next: Values
  editedField?: string
  ownerId: string | null
  actor: { name?: string | null; email?: string | null }
}): Promise<Values> {
  const next = { ...opts.next }
  if (opts.editedField === "surgeon_text") next["surgeon_text_edited"] = true
  if (opts.editedField === "epic_note") next["epic_note_edited"] = true

  const [def, profile, owner] = await Promise.all([
    getReferralCallDef(),
    getExtractionProfile(),
    opts.ownerId
      ? (prisma as any).user.findUnique({ where: { id: opts.ownerId }, select: { name: true, email: true } })
      : Promise.resolve(null),
  ])
  const extras = textExtrasFor(def?.properties ?? [], profile.fields, next)
  return deriveReferralCallValues(opts.stored, next, {
    actorInitials: initialsFor(opts.actor),
    ownerInitials: initialsFor(owner ?? {}),
    now: new Date(),
    surgeonExtras: extras.surgeon,
    noteExtras: extras.note,
  })
}
