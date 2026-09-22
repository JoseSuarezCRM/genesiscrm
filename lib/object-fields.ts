// ─── One field schema for every object ───────────────────────────────────────
// Before this module, five places built their own FilterField[] independently:
// referral-filter-fields, surgery-filter-fields, object-columns (client, custom
// objects), custom-object-records.serverFilterFields (server twin of the same
// thing) and reporting/objects. The client and server halves had to be kept in
// sync by hand, and they had already drifted — the client's __owner/__created
// carried no `column`, so those criteria silently did nothing server-side.
//
// The root cause was FilterField.getValue: a closure can't cross the server →
// client boundary, so the schema could never simply be built once and passed
// down. ObjectFieldDef replaces the closure with a declarative `readPath`, which
// makes the whole schema serializable. The server builds it (lib/object-fields-server),
// hands it to the client as a prop, and both sides call toFilterFields() to get
// identical behaviour. Divergence stops being something to remember.

import { OPERATORS, type FieldType, type FilterField, type FilterFieldOption, type FilterState } from "@/lib/filters"

export interface ObjectFieldDef {
  key: string
  label: string
  type: FieldType
  options?: FilterFieldOption[]
  /** DB column, or the key inside `jsonBag` when set. Absent ⇒ not translatable to SQL. */
  column?: string
  /** The JSON column holding custom properties: "values" (custom objects) or "customProperties". */
  jsonBag?: string
  /** Single-FK join: nest the condition under this Prisma relation (e.g. "practice"). */
  relationPath?: string
  /** For a relationPath field: can the related row be absent? See FilterField.relationNullable. */
  relationNullable?: boolean
  /** Many-to-many (e.g. tags): `{ [relation]: { some: { [key]: { in } } } }`. */
  relationSome?: { relation: string; key: string }
  /**
   * A count of related rows (e.g. a location's providers). Prisma's `where` has no
   * count comparison — only some/none/every — so these can't become SQL except for
   * the zero / non-zero cases. lib/object-query refines them in memory instead.
   */
  relationCount?: { relation: string }
  /**
   * Is the underlying column nullable? Read from Prisma's DMMF at registry build
   * time, never declared by hand — filter-to-prisma needs it to compensate for
   * Postgres NULL semantics, and Prisma rejects a null check outright on a
   * non-nullable column, so guessing is worse than not knowing.
   */
  nullable?: boolean
  /** Date fields: calendar value (UTC-midnight storage) vs real instant. See FilterField.dateOnly. */
  dateOnly?: boolean
  /** Where to read the value from a loaded row. Derived, never hand-written. */
  readPath: string[]
  /** Optional grouping label for the field picker ("Appointment properties"). */
  group?: string
}

/**
 * Where a field's value sits on a row Prisma returned.
 *
 * Derived from the same descriptors that drive the SQL translation, so the
 * in-memory read and the `where` can't disagree about which column they mean.
 */
export function deriveReadPath(def: Omit<ObjectFieldDef, "readPath">): string[] {
  if (def.relationCount) return ["_count", def.relationCount.relation]
  // A many-to-many arrives as join rows ([{ tagId }, …]) but the condition holds
  // tag ids, so the path has to pluck the key out of each row. "[]" means "map
  // the rest of the path over this array".
  if (def.relationSome) return [def.relationSome.relation, "[]", def.relationSome.key]
  if (def.jsonBag && def.column) return [def.jsonBag, def.column]
  if (def.relationPath && def.column) return [def.relationPath, def.column]
  if (def.column) return [def.column]
  return [def.key]
}

/** Attach the derived readPath — use instead of writing one by hand. */
export function field(def: Omit<ObjectFieldDef, "readPath">): ObjectFieldDef {
  return { ...def, readPath: deriveReadPath(def) }
}

/**
 * Walk a readPath, tolerating nulls at every step.
 *
 * Relation counts get a fallback chain because the same row can arrive three
 * ways: selected with `_count`, included as a full array, or neither. Returning
 * 0 rather than undefined for the last case keeps numeric operators meaningful.
 */
export function readValueAt(row: any, path: string[]): unknown {
  if (!row || path.length === 0) return undefined
  if (path[0] === "_count") {
    const rel = path[1]
    const c = row._count?.[rel]
    if (typeof c === "number") return c
    if (Array.isArray(row[rel])) return row[rel].length
    return 0
  }
  let cur: any = row
  for (let i = 0; i < path.length; i++) {
    if (cur === null || cur === undefined) return cur ?? undefined
    const step = path[i]
    if (step === "[]") {
      const rest = path.slice(i + 1)
      return Array.isArray(cur) ? cur.map((item) => readValueAt(item, rest)) : []
    }
    cur = cur[step]
  }
  return cur
}

/**
 * The runtime filter schema. This is the ONLY place a getValue closure is
 * created, and it's derived entirely from serialized data — so the array a
 * server component sends down produces byte-identical behaviour on the client.
 */
export function toFilterFields(defs: ObjectFieldDef[]): FilterField[] {
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: d.options,
    column: d.column,
    jsonBag: d.jsonBag,
    relationPath: d.relationPath,
    relationNullable: d.relationNullable,
    relationSome: d.relationSome,
    relationCount: d.relationCount,
    nullable: d.nullable,
    dateOnly: d.dateOnly,
    getValue: (row: any) => readValueAt(row, d.readPath),
  }))
}

export function fieldByKey(defs: ObjectFieldDef[]): Record<string, ObjectFieldDef> {
  return Object.fromEntries(defs.map((d) => [d.key, d]))
}

// ── Prose ────────────────────────────────────────────────────────────────────

function operatorLabel(type: FieldType, op: string): string {
  return OPERATORS[type]?.find((o) => o.value === op)?.label ?? op
}

function valueLabel(def: ObjectFieldDef, value: string | string[]): string {
  const label = (v: string) => def.options?.find((o) => o.value === v)?.label ?? v
  if (Array.isArray(value)) {
    const shown = value.slice(0, 3).map(label)
    return value.length > 3 ? `${shown.join(", ")} +${value.length - 3} more` : shown.join(", ")
  }
  return label(value)
}

/**
 * A one-line description of a filter, for the segment list and detail header.
 * Mirrors how the builder reads aloud: conditions joined inside a group, groups
 * joined by the outer combinator, an excluded group prefixed with "NOT".
 */
export function describeFilter(state: FilterState | null | undefined, defs: ObjectFieldDef[]): string {
  if (!state?.groups?.length) return "All records"
  const byKey = fieldByKey(defs)
  const parts: string[] = []

  for (const g of state.groups) {
    const conds: string[] = []
    for (const c of g.conditions) {
      const def = byKey[c.field]
      if (!def) continue
      const op = OPERATORS[def.type]?.find((o) => o.value === c.operator)
      const hasValue = Array.isArray(c.value) ? c.value.length > 0 : String(c.value ?? "") !== ""
      if (!op?.noValue && !hasValue) continue
      conds.push(
        op?.noValue
          ? `${def.label} ${operatorLabel(def.type, c.operator)}`
          : `${def.label} ${operatorLabel(def.type, c.operator)} ${valueLabel(def, c.value)}`,
      )
    }
    if (!conds.length) continue
    const inner = conds.join(` ${g.combinator.toLowerCase()} `)
    parts.push(g.not ? `NOT (${inner})` : conds.length > 1 ? `(${inner})` : inner)
  }

  if (!parts.length) return "All records"
  return parts.join(` ${state.combinator.toLowerCase()} `)
}
