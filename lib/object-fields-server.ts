// ─── The canonical filter-field registry (server) ────────────────────────────
// One async `fieldsFor(objectType)` for every object, built on reportFieldsFor
// (lib/reporting/objects) rather than beside it: that function already walks
// RECORD_FIELDS, loads the tenant's custom properties, resolves dynamic select
// options and understands the CO: key convention, and its ReportField is already
// serializable. Duplicating it would have made a sixth field builder.
//
// What it does add is the handful of things a *filter* needs that a *report*
// doesn't, declared per object in AUGMENT below, plus nullability from the DMMF.

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { FieldType } from "@/lib/filters"
import { field, type ObjectFieldDef } from "@/lib/object-fields"
import { reportFieldsFor } from "@/lib/reporting/objects"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { SURGERY_STATUS_LABELS } from "@/lib/surgery-constants"
import { isCustomObject } from "@/lib/automation-records"

/** Registry key → Prisma model, for DMMF lookups. */
const MODEL_OF: Record<string, string> = {
  REFERRAL: "Referral",
  PROVIDER: "ReferringDoctor",
  PRACTICE: "ReferringPractice",
  LOCATION: "PracticeLocation",
  SURGERY: "SurgeryCase",
  ACTIVITY: "Activity",
  TASK: "Task",
}

export function modelNameFor(objectType: string): string | null {
  if (isCustomObject(objectType)) return "CustomObjectRecord"
  return MODEL_OF[objectType] ?? null
}

/**
 * Which scalar columns of a model are nullable.
 *
 * From Prisma's generated DMMF, so it can never drift from the schema. It
 * matters more than it looks: filter-to-prisma must compensate for Postgres
 * NULL semantics on nullable columns and must NOT emit that compensation on
 * non-nullable ones, where Prisma rejects the query outright.
 */
function nullableColumns(objectType: string): Set<string> {
  const model = modelNameFor(objectType)
  const out = new Set<string>()
  if (!model) return out
  const m = (Prisma as any)?.dmmf?.datamodel?.models?.find((x: any) => x.name === model)
  for (const f of m?.fields ?? []) {
    if (f.kind !== "object" && !f.isRequired && !f.isList) out.add(f.name)
  }
  return out
}

async function activeUsers(): Promise<{ value: string; label: string }[]> {
  const users = await prisma.user
    .findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
    .catch(() => [])
  return users.map((u) => ({ value: u.id, label: u.name ?? u.email }))
}

// Extra filter criteria per object, keyed by registry key. Three kinds live here:
//
//  • USER foreign keys. reportFieldsFor deliberately drops the raw FK in favour
//    of a joined `<path>.name` text field (objects.ts:121) because a report wants
//    to *group by* a readable name. A filter wants the opposite — pick a person
//    from a list and match on id — so the FK comes back as a select.
//  • Single-FK joins (practice), via relationPath.
//  • Relation counts, which Prisma's `where` cannot compare at all; they're
//    marked so lib/object-query refines them in memory instead of dropping them.
interface Augment {
  users?: { key: string; label: string; column: string }[]
  /** `fk` is the foreign-key column, so relation-optionality comes from the DMMF too. */
  joins?: { key: string; label: string; relationPath: string; column: string; fk: string }[]
  counts?: { key: string; label: string; relation: string }[]
  m2m?: { key: string; label: string; relation: string; relKey: string; options?: () => Promise<{ value: string; label: string }[]> }[]
  /**
   * Real columns that RECORD_FIELDS doesn't list, so reportFieldsFor never sees
   * them. Declared here rather than added to RECORD_FIELDS because that catalog
   * also drives the editable property cards and the create modal — surgery's
   * `status` is stage-managed and shouldn't become a free-text card field.
   */
  extras?: { key: string; label: string; type: FieldType; column: string; options?: { value: string; label: string }[] }[]
  /**
   * Foreign keys offered as a pick-from-a-list select. reportFieldsFor exposes
   * the joined NAME (good for grouping a report); a filter wants to choose the
   * practice or provider itself and match on id. Options load lazily so the
   * lists are only queried when the schema is actually built.
   */
  fkSelects?: { key: string; label: string; column: string; options: () => Promise<{ value: string; label: string }[]> }[]
}

const AUGMENT: Record<string, Augment> = {
  REFERRAL: {
    users: [{ key: "assignedToId", label: "Referral Owner", column: "assignedToId" }],
    joins: [{ key: "practice.name", label: "Referring Practice", relationPath: "referringPractice", column: "name", fk: "referringPracticeId" }],
    fkSelects: [
      { key: "referringPracticeId", label: "Referring Practice", column: "referringPracticeId",
        options: async () => (await prisma.referringPractice.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => [])).map((x) => ({ value: x.id, label: x.name })) },
      { key: "referringDoctorId", label: "Referring Provider", column: "referringDoctorId",
        options: async () => (await prisma.referringDoctor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => [])).map((x) => ({ value: x.id, label: x.name })) },
      { key: "referringLocationId", label: "Referring Location", column: "referringLocationId",
        options: async () => (await prisma.practiceLocation.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => [])).map((x) => ({ value: x.id, label: x.name })) },
    ],
    m2m: [{
      key: "tags", label: "Tags", relation: "tags", relKey: "tagId",
      options: async () => (await prisma.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => [])).map((t) => ({ value: t.id, label: t.name })),
    }],
  },
  PROVIDER: {
    users: [{ key: "ownerId", label: "Provider Owner", column: "ownerId" }],
    joins: [{ key: "practice.name", label: "Practice", relationPath: "practice", column: "name", fk: "practiceId" }],
    counts: [
      { key: "referralCount", label: "Referrals (count)", relation: "referrals" },
      { key: "locationCount", label: "Locations (count)", relation: "locations" },
    ],
  },
  PRACTICE: { users: [{ key: "ownerId", label: "Practice Owner", column: "ownerId" }] },
  LOCATION: {
    users: [{ key: "ownerId", label: "Location Owner", column: "ownerId" }],
    joins: [{ key: "practice.name", label: "Practice", relationPath: "practice", column: "name", fk: "practiceId" }],
    counts: [
      { key: "providerCount", label: "Providers (count)", relation: "doctors" },
      { key: "referralCount", label: "Referrals (count)", relation: "referrals" },
      { key: "activityCount", label: "Activities (count)", relation: "activities" },
    ],
  },
  ACTIVITY: {
    users: [{ key: "ownerId", label: "Activity Owner", column: "ownerId" }],
    joins: [
      { key: "practice.name", label: "Practice", relationPath: "practice", column: "name", fk: "practiceId" },
      { key: "location.name", label: "Location", relationPath: "location", column: "name", fk: "locationId" },
    ],
  },
  TASK: { users: [{ key: "assignedToId", label: "Assigned To", column: "assignedToId" }] },
  SURGERY: {
    users: [{ key: "ownerId", label: "Surgery Owner", column: "ownerId" }],
    extras: [
      { key: "status", label: "Status", type: "select", column: "status",
        options: Object.entries(SURGERY_STATUS_LABELS).map(([value, label]) => ({ value, label: String(label) })) },
      { key: "expires", label: "Expires", type: "date", column: "expires" },
    ],
  },
}

/**
 * Every filter criterion for an object — native columns, custom properties,
 * owner, single-FK joins and relation counts — in one serializable array.
 *
 * Callers pass this straight to a client component and call toFilterFields() on
 * both sides, which is what stops the client and server schemas from drifting.
 */
export async function fieldsFor(objectType: string): Promise<ObjectFieldDef[]> {
  const base = await reportFieldsFor(objectType).catch(() => [])
  const nullable = nullableColumns(objectType)
  const defs: ObjectFieldDef[] = []

  // reportFieldsFor maps both "date" and "datetime" to the single report type
  // "date", which loses the distinction a filter needs: a DATE column is a
  // calendar value stored at UTC midnight, a DATETIME is an instant whose day is
  // a clinic question. Recover it from the catalog the report layer read.
  const granularity: Record<string, boolean> = {}
  for (const f of RECORD_FIELDS[objectType] ?? []) {
    if (f.type === "date") granularity[f.key] = true
    else if (f.type === "datetime") granularity[f.key] = false
  }

  for (const f of base) {
    // Time-in-stage is computed from StageTransition rows, not a column, so there
    // is nothing to translate and nothing to read off a plain row.
    if ((f as any).stageDuration) continue
    // A joined `<path>.name` from the report layer is a display field; the
    // augmentation below re-adds the ones that make sense as filter criteria,
    // with proper option lists.
    if ((f as any).joinPath) continue
    defs.push(field({
      // Custom-object properties are keyed `cp_<id>` here, not by the bare id
      // reportFieldsFor uses. That prefix is what every list has always written
      // and what saved CustomObjectView filters contain, so dropping it would
      // silently blank those views. Reports keep the bare id — they store their
      // own field refs and are unaffected. `column` stays the raw id either way,
      // since that's the JSON path.
      key: isCustomObject(objectType) && f.jsonBag ? `cp_${f.key}` : f.key,
      label: f.label,
      // A custom object's "Record ID" is declared text by the report layer but is
      // backed by the integer `recordNumber`, so text operators reach Postgres as
      // `contains` on an Int and Prisma rejects the query. Filters need the real type.
      type: (f.column === "recordNumber" ? "number" : f.type) as FieldType,
      options: f.options,
      column: f.column,
      jsonBag: f.jsonBag,
      // A missing key in a JSON bag reads as absent, so bag fields are always
      // "nullable" regardless of what the column itself says.
      nullable: f.jsonBag ? true : nullable.has(f.column),
      // Custom properties are strings in a JSON bag and are compared as calendar
      // days by their own path, so granularity only applies to real columns.
      // `createdAt`/`updatedAt` aren't in the catalog and are always instants.
      dateOnly: f.type !== "date" || f.jsonBag ? undefined
        : (granularity[f.key] ?? (/^(createdAt|updatedAt|creationDate)$/.test(f.column) ? false : undefined)),
    }))
  }

  const aug = AUGMENT[objectType] ?? (isCustomObject(objectType) ? {} : {})
  const seen = new Set(defs.map((d) => d.key))

  if (aug.users?.length) {
    const options = await activeUsers()
    for (const u of aug.users) {
      if (seen.has(u.key)) continue
      defs.push(field({ key: u.key, label: u.label, type: "select", options, column: u.column, nullable: nullable.has(u.column) }))
    }
  }
  for (const j of aug.joins ?? []) {
    if (seen.has(j.key)) continue
    defs.push(field({
      key: j.key, label: j.label, type: "text",
      relationPath: j.relationPath, column: j.column,
      // The joined column: `name` is required on every practice/location, so
      // "is known" folds to a constant rather than an illegal null check.
      nullable: false,
      // The RELATION, separately: an activity may have no practice at all.
      relationNullable: nullable.has(j.fk),
    }))
  }
  for (const c of aug.counts ?? []) {
    if (seen.has(c.key)) continue
    defs.push(field({ key: c.key, label: c.label, type: "number", relationCount: { relation: c.relation } }))
  }
  for (const e of aug.extras ?? []) {
    if (seen.has(e.key)) continue
    defs.push(field({
      key: e.key, label: e.label, type: e.type, options: e.options, column: e.column,
      nullable: nullable.has(e.column),
      dateOnly: e.type === "date" ? false : undefined,
    }))
  }
  for (const fk of aug.fkSelects ?? []) {
    if (seen.has(fk.key)) continue
    defs.push(field({
      key: fk.key, label: fk.label, type: "select", column: fk.column,
      options: await fk.options(), nullable: nullable.has(fk.column),
    }))
  }
  for (const m of aug.m2m ?? []) {
    if (seen.has(m.key)) continue
    defs.push(field({
      key: m.key, label: m.label, type: "select",
      options: m.options ? await m.options() : undefined,
      relationSome: { relation: m.relation, key: m.relKey },
    }))
  }

  // Custom objects address the same three meta criteria by these exact keys, and
  // saved CustomObjectView filters already reference them — so they keep their
  // names and simply gain the DB columns the client half never had.
  if (isCustomObject(objectType)) {
    const options = await activeUsers()
    const ownerLabel = await customOwnerLabel(objectType)
    // Nullability is stated for every one of these. `undefined` means "unknown"
    // to the SQL compiler, which then keeps the legacy null-check behaviour —
    // correct for the older per-list builders, but illegal on a required column
    // ("Argument `not` is missing"). Anything this registry emits must be definite.
    for (const d of [
      field({ key: "__recordNumber", label: "Record ID", type: "number", column: "recordNumber", nullable: nullable.has("recordNumber") }),
      field({ key: "__owner", label: ownerLabel, type: "select", options, column: "ownerId", nullable: nullable.has("ownerId") }),
      field({ key: "__created", label: "Created", type: "date", column: "createdAt", nullable: nullable.has("createdAt") }),
    ]) if (!seen.has(d.key)) defs.push(d)
  }

  // Backstop: `nullable` is a tri-state, and leaving it undefined on a plain
  // column makes the compiler fall back to legacy behaviour that is illegal on a
  // required column. Every field this registry owns is resolved against the DMMF
  // here, so forgetting to state it on a new entry can't reintroduce that.
  // Skipped for jsonBag (always effectively nullable) and relationPath fields
  // (whose `column` belongs to the JOINED model, not this one).
  for (const d of defs) {
    if (d.nullable === undefined && d.column && !d.jsonBag && !d.relationPath) {
      d.nullable = nullable.has(d.column)
    }
  }

  return defs
}

async function customOwnerLabel(objectType: string): Promise<string> {
  const def = await (prisma as any).customObjectDef
    .findUnique({ where: { key: objectType.slice(3) }, select: { singular: true, ownerLabel: true } })
    .catch(() => null)
  return def?.ownerLabel || (def?.singular ? `${def.singular} Owner` : "Record Owner")
}
