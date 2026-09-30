"use server"

/**
 * Saving a referral call from the on-call intake.
 *
 * A dedicated action rather than the generic custom-object ones, for three
 * reasons: the form's shape is not the record's (dates, outcome arrays, the
 * decision maker), several values are derived here rather than trusted from
 * the client (title, charted by/at, the texts), and an update writes only what
 * this form actually changed — so a colleague ticking "Charted" in the call log
 * while this form is open is not silently undone by saving it.
 *
 * Only async functions may be exported from a "use server" file; the shared
 * schemas, constants and types live in lib/referral-calls/.
 */

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { createAuditLog } from "@/lib/audit"
import { runTrigger_RecordPropertyChanged, runTrigger_RecordOwnerChanged } from "@/lib/automation-engine"
import { createCustomObjectRecord } from "@/app/actions/custom-object-records"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import { RC_OBJECT_KEY, RC_PERM_KEY } from "@/lib/referral-calls/constants"
import { ensureReferralCallObject } from "@/lib/referral-calls/provision"
import { getExtractionProfile } from "@/lib/referral-calls/profile"
import { deriveReferralCallValues } from "@/lib/referral-calls/derive"
import { parseDob } from "@/lib/referral-calls/dob"
import { initialsFor } from "@/lib/referral-calls/initials"
import { addedProperties, coerceExtraValue, textExtrasFor } from "@/lib/referral-calls/extras"
import { rcSafeLog } from "@/lib/referral-calls/safe-log"
import {
  SaveInputSchema,
  changedKeys,
  mergeFormChanges,
  snapshotToValues,
  valuesToSnapshot,
  type ReferralCallSnapshot,
} from "@/lib/referral-calls/snapshot"
import type { ReferralCallFields } from "@/lib/referral-calls/types"

export type SaveReferralCallResult =
  | { ok: true; id: string; recordNumber: number | null; ownerId: string; snapshot: ReferralCallSnapshot }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof ReferralCallFields, string>> }

type Values = Record<string, unknown>
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Check and normalise the added-property values against their types. */
function normalizeExtras(
  s: ReferralCallSnapshot,
  byId: Map<string, CustomObjectProperty>,
): { snapshot: ReferralCallSnapshot } | { error: string } {
  const extras: ReferralCallSnapshot["extras"] = {}
  for (const [id, v] of Object.entries(s.extras)) {
    const p = byId.get(id)
    if (!p) continue // a property deleted since the form loaded: drop it
    const c = coerceExtraValue(p, v)
    if (c === undefined) return { error: `"${p.name}" has a value that doesn't fit its type.` }
    extras[id] = c
  }
  return { snapshot: { ...s, extras } }
}

export async function saveReferralCall(raw: unknown): Promise<SaveReferralCallResult> {
  const session = await auth()
  const actor = session?.user as { id: string; name?: string | null; email?: string | null } | undefined
  if (!actor?.id) return { ok: false, error: "Your session has ended. Sign in again, then save." }
  if (!userCanLevel(session!.user as any, RC_PERM_KEY, "EDIT")) {
    return { ok: false, error: "You don't have permission to log calls." }
  }

  const parsed = SaveInputSchema.safeParse(raw)
  // Never echo the issues back or log them: zod issues carry the received input.
  if (!parsed.success) return { ok: false, error: "Some fields couldn't be read. Nothing was saved." }
  const input = parsed.data

  const dob = input.current.fields.dob.trim()
  if (dob && !parseDob(dob)) {
    return { ok: false, error: "Check the date of birth.", fieldErrors: { dob: "Not a valid date (MM/DD/YYYY)" } }
  }

  try {
    const def = await ensureReferralCallObject(actor.id)
    const added = addedProperties(def.properties)
    const addedById = new Map(added.map((p) => [p.id, p]))
    const extraIds = new Set(addedById.keys())

    const cur = normalizeExtras(input.current, addedById)
    if ("error" in cur) return { ok: false, error: cur.error }
    const baseSnap = input.baseline ? normalizeExtras(input.baseline, addedById) : null
    const mine = snapshotToValues(cur.snapshot, extraIds)

    const profile = await getExtractionProfile()
    const now = new Date()

    /** Owner = the call-taker. A newly chosen one must be a real, active user. */
    const resolveOwner = async (wanted: string | null | undefined, fallback: string) => {
      const id = wanted || fallback
      const u = await (prisma as any).user.findFirst({
        where: { id, isActive: true },
        select: { id: true, name: true, email: true },
      })
      return u ?? { id: actor.id, name: actor.name ?? null, email: actor.email ?? null }
    }
    const ctxFor = (owner: { name?: string | null; email?: string | null }, values: Values) => {
      const extras = textExtrasFor(def.properties, profile.fields, values)
      return {
        actorInitials: initialsFor(actor),
        ownerInitials: initialsFor(owner),
        now,
        surgeonExtras: extras.surgeon,
        noteExtras: extras.note,
      }
    }

    /* ── New call ───────────────────────────────────────────────────────── */
    if (!input.recordId) {
      const owner = await resolveOwner(input.ownerId, actor.id)
      const values = deriveReferralCallValues({}, mine, ctxFor(owner, mine))
      const res: any = await createCustomObjectRecord(RC_OBJECT_KEY, values, owner.id)
      if (!res?.success || !res.id) return { ok: false, error: "The call couldn't be saved. Try again." }
      const rec = await (prisma as any).customObjectRecord.findUnique({
        where: { id: res.id },
        select: { recordNumber: true, values: true },
      })
      await createAuditLog({
        userId: actor.id,
        action: "RECORD_CREATE",
        resourceType: RC_PERM_KEY,
        resourceId: res.id,
        // Keys only. The values are clinical details.
        metadata: { objectKey: RC_OBJECT_KEY, keys: Object.keys(values).filter((k) => !same(values[k], "") && !same(values[k], false)) },
      })
      revalidatePath(`/objects/${RC_OBJECT_KEY}`)
      return {
        ok: true,
        id: res.id,
        recordNumber: rec?.recordNumber ?? null,
        ownerId: owner.id,
        snapshot: valuesToSnapshot((rec?.values as Values) ?? values, extraIds),
      }
    }

    /* ── Existing call ──────────────────────────────────────────────────── */
    // Scoped to this object: a record id from another object must not be
    // writable through this action just because the caller can edit calls.
    const rec = await (prisma as any).customObjectRecord.findFirst({
      where: { id: input.recordId, objectDefId: def.id },
      select: { id: true, values: true, ownerId: true, recordNumber: true },
    })
    if (!rec) return { ok: false, error: "That call no longer exists." }

    const stored: Values = (rec.values as Values) ?? {}
    const base = baseSnap && "snapshot" in baseSnap ? snapshotToValues(baseSnap.snapshot, extraIds) : stored

    // Write only what THIS form changed since it loaded. Anything someone else
    // changed meanwhile — in the call log, on the detail page — is kept.
    const next = mergeFormChanges(stored, base, mine)

    // Same rule for the owner: only a change made in this form is applied.
    const ownerTouched =
      input.ownerId !== undefined && (!input.baseline || (input.ownerId ?? null) !== (input.baselineOwnerId ?? null))
    const owner = ownerTouched
      ? await resolveOwner(input.ownerId, actor.id)
      : await resolveOwner(rec.ownerId, rec.ownerId ?? actor.id)
    const ownerId: string = ownerTouched ? owner.id : (rec.ownerId ?? owner.id)

    const derived = deriveReferralCallValues(stored, next, ctxFor(owner, next))
    const changes: Values = Object.fromEntries(changedKeys(stored, derived).map((k) => [k, derived[k]]))
    const ownerChanged = (rec.ownerId ?? null) !== ownerId

    if (Object.keys(changes).length || ownerChanged) {
      await (prisma as any).customObjectRecord.update({
        where: { id: rec.id },
        data: { values: derived, ownerId, updatedById: actor.id },
      })
      if (Object.keys(changes).length) {
        await runTrigger_RecordPropertyChanged(RC_PERM_KEY, rec.id, changes, actor.id).catch(() => {})
      }
      if (ownerChanged) await runTrigger_RecordOwnerChanged(RC_PERM_KEY, rec.id, ownerId, actor.id).catch(() => {})
      await createAuditLog({
        userId: actor.id,
        action: "RECORD_UPDATE",
        resourceType: RC_PERM_KEY,
        resourceId: rec.id,
        metadata: { objectKey: RC_OBJECT_KEY, changedKeys: Object.keys(changes), ownerChanged },
      })
      revalidatePath(`/objects/${RC_OBJECT_KEY}`)
      revalidatePath(`/objects/${RC_OBJECT_KEY}/${rec.id}`)
    }

    return {
      ok: true,
      id: rec.id,
      recordNumber: rec.recordNumber ?? null,
      ownerId,
      snapshot: valuesToSnapshot(derived, extraIds),
    }
  } catch (e) {
    // The error may carry record values (Prisma echoes its arguments): log its
    // kind only, and give the person a message that's actually theirs.
    rcSafeLog("save_failed", { code: errorCode(e) })
    const msg = e instanceof Error && e.message.includes("wasn't created by the On-call intake") ? e.message : null
    return { ok: false, error: msg ?? "The call couldn't be saved. Try again." }
  }
}

function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === "string" && /^[A-Z0-9_]{1,12}$/.test(code)) return code
  return e instanceof Error ? e.name.slice(0, 40) : "unknown"
}
