/**
 * Makes sure the "Referral Calls" custom object exists and has every property
 * the intake writes to. Server-only.
 *
 * Runs lazily at the top of the /on-call pages rather than in a seed or a
 * migration: `prisma/seed.ts` never runs on deploy, and a property added later
 * would otherwise need a new SQL migration every time. The steady-state cost is
 * one indexed read.
 *
 * It only ever ADDS. Existing labels, colours, descriptions, card layouts and
 * admin-added properties are never touched — an admin who renamed "Callback"
 * keeps their name across every deploy.
 */

import { prisma } from "@/lib/prisma"
import type { CustomObjectProperty } from "@/app/actions/custom-objects"
import { RC_DEFAULT_COLUMNS, RC_OBJECT_KEY, RC_PERM_KEY, RC_RETIRED_STATUSES } from "./constants"
import { RC_PROPERTIES } from "./schema"

export interface ReferralCallDef {
  id: string
  key: string
  singular: string
  ownerLabel: string
  properties: CustomObjectProperty[]
}

const SELECT = { id: true, key: true, singular: true, ownerLabel: true, properties: true, updatedAt: true } as const

/** The Prisma client, or a transaction client (the provisioning check runs in one it rolls back). */
type Db = any

/** The object, if it has been set up. Never creates anything. */
export async function getReferralCallDef(db: Db = prisma): Promise<ReferralCallDef | null> {
  const def = await db.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY }, select: SELECT })
  return def ? toDef(def) : null
}

/**
 * The object, creating or completing it first. Pass the signed-in user: they
 * own the seeded views, and are recorded as the creator.
 */
export async function ensureReferralCallObject(actorUserId: string, db: Db = prisma): Promise<ReferralCallDef> {
  let def = await db.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY }, select: SELECT })

  if (!def) {
    try {
      def = await createObject(actorUserId, db)
    } catch (e: any) {
      // Two people opened the page at once and the other request won. Read theirs.
      if (e?.code !== "P2002") throw e
      def = await db.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY }, select: SELECT })
      if (!def) throw e
    }
    return toDef(def)
  }

  assertOurs(def.properties)

  // A status the spec retired is still on the property: clear it from the
  // records holding it before the option goes. Runs once, then never again.
  const retiring = retiredStatusesIn(def.properties as CustomObjectProperty[])
  if (retiring.length) await migrateRetiredStatuses(def.id, retiring, db)

  // Append anything a later version of the spec added. Optimistic on updatedAt,
  // so a concurrent Settings save is retried against rather than overwritten.
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = def.properties as CustomObjectProperty[]
    const retired = retireStatusOptions(stored)
    const merged = completeProperties(retired ?? stored) ?? retired
    if (!merged) return toDef(def)
    const res = await db.customObjectDef.updateMany({
      where: { id: def.id, updatedAt: def.updatedAt },
      data: { properties: merged },
    })
    if (res.count === 1) {
      return toDef({ ...def, properties: merged })
    }
    def = await db.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY }, select: SELECT })
    if (!def) throw new Error("The call log object disappeared while it was being updated.")
  }
  return toDef(def)
}

/* ── internals ─────────────────────────────────────────────────────────────── */

function toDef(d: any): ReferralCallDef {
  return {
    id: d.id,
    key: d.key,
    singular: d.singular,
    ownerLabel: d.ownerLabel,
    properties: (d.properties ?? []) as CustomObjectProperty[],
  }
}

/**
 * Refuse to adopt an object that merely shares our key — someone may have
 * created a "Referral Calls" object by hand with different fields, and writing
 * the intake's values into it would scramble their data.
 */
function assertOurs(properties: unknown) {
  const list = Array.isArray(properties) ? (properties as CustomObjectProperty[]) : []
  // Recognised by a signature of ids AND types no hand-made object would share.
  // Not by the lock flag: every app path keeps it, and if it were lost anyway
  // the right response is to restore it (completeProperties), not to lock
  // everyone out of the intake.
  const matches = SIGNATURE.filter(([id, type]) => list.some((p) => p.id === id && p.type === type)).length
  const ours = matches >= 3
  if (!ours) {
    throw new Error(
      `A custom object with the key "${RC_OBJECT_KEY}" already exists and wasn't created by the On-call intake. ` +
        "Rename or remove it in Settings → Custom Objects, then open this page again.",
    )
  }
}

const SIGNATURE: [string, CustomObjectProperty["type"]][] = [
  ["status", "DROPDOWN"], ["surgeon_text", "LONG_TEXT"], ["epic_note", "LONG_TEXT"],
  ["charted", "CHECKBOX"], ["call_title", "TEXT"],
]

/**
 * The stored list plus anything the spec has that it lacks: missing properties
 * appended, missing option values appended, lost lock flags restored. Returns
 * null when nothing needs to change.
 */
function completeProperties(stored: CustomObjectProperty[]): CustomObjectProperty[] | null {
  let changed = false
  const out = stored.map((p) => ({ ...p }))
  const byId = new Map(out.map((p) => [p.id, p]))

  for (const spec of RC_PROPERTIES) {
    const have = byId.get(spec.id)
    if (!have) {
      out.push({ ...spec })
      changed = true
      continue
    }
    if (!have.locked) {
      have.locked = true
      changed = true
    }
    const missing = (spec.options ?? []).filter((o) => !(have.options ?? []).includes(o))
    if (missing.length) {
      have.options = [...(have.options ?? []), ...missing]
      have.optionLabels = { ...(have.optionLabels ?? {}) }
      for (const o of missing) have.optionLabels[o] = spec.optionLabels?.[o] ?? o
      changed = true
    }
  }
  return changed ? out : null
}

/** Retired status values still present on the stored status property. */
function retiredStatusesIn(stored: CustomObjectProperty[]): string[] {
  const status = stored.find((p) => p.id === "status")
  return (status?.options ?? []).filter((o) => RC_RETIRED_STATUSES.includes(o))
}

/**
 * The status property without its retired values, ordered spec-first with any
 * admin-added options after. Labels and colours already stored are kept — an
 * admin may have renamed one. Null when nothing is retired, so outside this
 * one-time step provisioning stays append-only and never reorders an admin's
 * options.
 */
export function retireStatusOptions(stored: CustomObjectProperty[]): CustomObjectProperty[] | null {
  const at = stored.findIndex((p) => p.id === "status")
  if (at < 0 || !retiredStatusesIn(stored).length) return null
  const have = stored[at]
  const spec = RC_PROPERTIES.find((p) => p.id === "status")!
  const specOptions = spec.options ?? []
  const extras = (have.options ?? []).filter((o) => !RC_RETIRED_STATUSES.includes(o) && !specOptions.includes(o))
  const options = [...specOptions, ...extras]
  const optionLabels: Record<string, string> = {}
  for (const o of options) optionLabels[o] = have.optionLabels?.[o] ?? spec.optionLabels?.[o] ?? o
  const optionColors = have.optionColors
    ? Object.fromEntries(Object.entries(have.optionColors).filter(([o]) => options.includes(o)))
    : undefined
  const out = stored.map((p) => ({ ...p }))
  out[at] = { ...have, options, optionLabels, ...(optionColors ? { optionColors } : {}) }
  return out
}

/**
 * The record-side half of retiring a status: records holding it lose the
 * value (left blank, as the on-call staff asked), and the shared views still
 * on the first seeded column set move to the current default columns. Both
 * idempotent.
 */
async function migrateRetiredStatuses(objectDefId: string, retiring: string[], db: Db) {
  for (const value of retiring) {
    const records = await db.customObjectRecord.findMany({
      where: { objectDefId, values: { path: ["status"], equals: value } },
      select: { id: true, values: true },
    })
    for (const r of records) {
      const { status: _retired, ...rest } = (r.values ?? {}) as Record<string, unknown>
      await db.customObjectRecord.update({ where: { id: r.id }, data: { values: rest } })
    }
  }
  const views = await db.customObjectView.findMany({ where: { objectKey: RC_OBJECT_KEY }, select: { id: true, config: true } })
  for (const v of views) {
    const config = (v.config ?? {}) as Record<string, unknown>
    if (JSON.stringify(config.columns) !== JSON.stringify(SEEDED_COLUMNS_V1)) continue
    await db.customObjectView.update({ where: { id: v.id }, data: { config: { ...config, columns: RC_DEFAULT_COLUMNS } } })
  }
}

async function createObject(actorUserId: string, db: Db) {
  const last = await db.customObjectDef.findFirst({ orderBy: { order: "desc" }, select: { order: true } })

  const create = async (tx: Db) => {
    const def = await tx.customObjectDef.create({
      data: {
        key: RC_OBJECT_KEY,
        singular: "Referral Call",
        plural: "Referral Calls",
        icon: "PhoneIncoming",
        ownerLabel: "Call taken by",
        properties: RC_PROPERTIES,
        cards: [],
        order: (last?.order ?? 0) + 1,
        createdById: actorUserId,
      },
      select: SELECT,
    })

    // The detail page lays itself out from RecordCard rows, not from the def's
    // own `cards` field, so the layout is seeded there. Only on creation: after
    // that the layout belongs to the admins. Deleting a custom object leaves its
    // cards and views behind, so an earlier object with this key may have left
    // some: keep those rather than fail or duplicate.
    await tx.recordCard.createMany({
      data: CARDS.map((c, i) => ({ objectType: RC_PERM_KEY, order: i, ...c })),
      skipDuplicates: true,
    })
    const existingViews = await tx.customObjectView.count({ where: { objectKey: RC_OBJECT_KEY } })
    if (!existingViews) {
      for (const view of VIEWS) {
        await tx.customObjectView.create({
          data: { objectKey: RC_OBJECT_KEY, name: view.name, userId: actorUserId, visibility: "EVERYONE", config: view.config },
        })
      }
    }
    return def
  }
  // Already inside a transaction (the check script): run in it.
  return typeof db.$transaction === "function" ? db.$transaction(create) : create(db)
}

const CARDS: { cardName: string; title: string; fields: string[]; section: "LEFT" | "MIDDLE"; columns: number }[] = [
  { cardName: "call", title: "Call", section: "LEFT", columns: 1,
    fields: ["status", "urgent", "__owner", "referred_from", "caller", "callback", "room", "reason"] },
  { cardName: "patient", title: "Patient", section: "LEFT", columns: 1,
    fields: ["first_name", "last_name", "dob", "patient_phone"] },
  { cardName: "charting", title: "Charting", section: "LEFT", columns: 1,
    fields: ["charted", "charted_by", "charted_at"] },
  { cardName: "record-details", title: "Record details", section: "LEFT", columns: 1,
    fields: ["__recordId", "__createdBy", "__createdAt", "__updatedBy", "__updatedAt"] },
  { cardName: "texts", title: "Text to surgeon & Epic note", section: "MIDDLE", columns: 1,
    fields: ["surgeon_text", "epic_note"] },
  { cardName: "details", title: "Call details", section: "MIDDLE", columns: 2,
    fields: ["hpi", "labs_imaging", "pmhx", "meds", "blood_thinner", "blood_thinner_last_dose", "npo_since", "social", "decision_maker", "poa_name", "poa_phone"] },
  { cardName: "outcome", title: "Outcome", section: "MIDDLE", columns: 1,
    fields: ["outcome", "abx_detail", "other_notes", "status_changed_at"] },
  { cardName: "source", title: "Source", section: "MIDDLE", columns: 1,
    fields: ["notes", "source_text"] },
]

/** The columns the shared views were first seeded with; views still on them are moved to RC_DEFAULT_COLUMNS. */
const SEEDED_COLUMNS_V1 = ["__id", "__name", "status", "urgent", "referred_from", "reason", "dob", "__owner", "charted", "__created"]

const view = (name: string, conditions: { field: string; operator: string; value: string | string[] }[]) => ({
  name,
  config: {
    type: "table",
    sort: { key: "__id", dir: "desc" },
    columns: RC_DEFAULT_COLUMNS,
    filter: {
      combinator: "AND",
      groups: [{ id: "g1", combinator: "AND", conditions: conditions.map((c, i) => ({ id: `c${i + 1}`, ...c })) }],
    },
  },
})

const VIEWS = [
  view("Awaiting surgeon", [{ field: "cp_status", operator: "is_any_of", value: ["sent_to_surgeon"] }]),
  view("Urgent · last 7 days", [
    { field: "cp_urgent", operator: "is_true", value: "" },
    { field: "__created", operator: "relative", value: "last_7" },
  ]),
  view("Not charted", [{ field: "cp_charted", operator: "is_false", value: "" }]),
]
