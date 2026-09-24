// ─── One way to ask "which records match this filter?" ───────────────────────
// Every reader of a filtered set — the list, its count, the CSV export, the
// footer totals, a segment's size — has to build the set here, so a total can
// never be computed over a different set than the rows. That rule already
// existed for custom objects (app/actions/custom-object-records.ts listWhere);
// this generalises it to every object.
//
// Two things happen that a plain filterStateToWhere can't do alone:
//
//  1. A pre-pass resolves custom-property conditions in raw SQL, because
//     Prisma's JSON filters are case-sensitive and have no numeric or date
//     operators (see lib/json-predicate).
//  2. Conditions with no SQL form at all — relation counts, which Prisma's
//     `where` cannot compare — are refined in memory afterwards, over a SQL
//     result that is deliberately a SUPERSET.
//
// What it never does is drop a condition silently.

import { prisma } from "@/lib/prisma"
import { matchesFilter, type Condition, type FilterField, type FilterState } from "@/lib/filters"
import { explainFilterState, filterStateToWhere, type FilterExplanation } from "@/lib/filter-to-prisma"
import { needsRawResolution, resolveJsonPredicates, type JsonResolution } from "@/lib/json-predicate"
import { fieldsFor, modelNameFor } from "@/lib/object-fields-server"
import { toFilterFields, type ObjectFieldDef } from "@/lib/object-fields"
import { delegateFor, isCustomObject } from "@/lib/automation-records"

/** Refining in memory means loading rows; past this many we stop and say so. */
export const PREFILTER_CAP = 25_000

export interface ObjectScope {
  /** Restricts custom-object rows to one definition. */
  where: Record<string, unknown>
  objectDefId: string | null
  table: string | null
}

export async function scopeFor(objectType: string): Promise<ObjectScope> {
  const table = modelNameFor(objectType)
  if (!isCustomObject(objectType)) return { where: {}, objectDefId: null, table }
  const def = await (prisma as any).customObjectDef
    .findUnique({ where: { key: objectType.slice(3) }, select: { id: true } })
    .catch(() => null)
  return { where: def ? { objectDefId: def.id } : { id: { in: [] } }, objectDefId: def?.id ?? null, table }
}

/** Run the raw-SQL pre-pass for every custom-property condition that needs it. */
export async function resolveFor(
  objectType: string,
  state: FilterState | null | undefined,
  fields: FilterField[],
  scope?: ObjectScope,
): Promise<JsonResolution> {
  if (!state) return {}
  const sc = scope ?? (await scopeFor(objectType))
  if (!sc.table) return {}
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]))
  const items: { cond: Condition; field: FilterField }[] = []
  for (const g of state.groups ?? []) {
    for (const c of g.conditions ?? []) {
      const f = byKey[c.field]
      if (f && needsRawResolution(f, c.operator)) items.push({ cond: c, field: f })
    }
  }
  if (!items.length) return {}
  return resolveJsonPredicates({
    table: sc.table,
    scope: sc.objectDefId ? { column: "objectDefId", value: sc.objectDefId } : null,
    items,
  })
}

/**
 * The Prisma `where` for a filter, with custom properties already resolved.
 *
 * `explanation.untranslatable` is what could NOT be expressed and therefore has
 * to be refined in memory — today that is relation counts only.
 */
export async function buildObjectWhere(
  objectType: string,
  state: FilterState | null | undefined,
  fields: FilterField[],
  scope?: ObjectScope,
): Promise<{ where: Record<string, unknown>; resolved: JsonResolution; explanation: FilterExplanation; scope: ObjectScope }> {
  const sc = scope ?? (await scopeFor(objectType))
  const resolved = await resolveFor(objectType, state, fields, sc)
  const explanation = explainFilterState(state, fields, resolved)
  // Dropping an untranslatable condition from SQL keeps the result a SUPERSET,
  // which the in-memory pass then narrows. Relaxing is only safe outside a
  // negated group — inside one it would widen the final answer, so those fall
  // back to a full scan in queryObjectIds.
  const where = { ...sc.where, ...filterStateToWhere(state, fields, resolved) }
  return { where, resolved, explanation, scope: sc }
}

/** Does any untranslatable condition sit inside an excluded group? */
function untranslatableUnderNot(state: FilterState | null | undefined, ex: FilterExplanation): boolean {
  if (!state || !ex.untranslatable.length) return false
  const bad = new Set(ex.untranslatable.map((u) => u.field))
  return (state.groups ?? []).some((g) => g.not && (g.conditions ?? []).some((c) => bad.has(c.field)))
}

/** What loading rows for the in-memory pass needs selected. */
function refineArgs(defs: ObjectFieldDef[]) {
  const include: Record<string, unknown> = {}
  const counts: Record<string, boolean> = {}
  for (const d of defs) {
    if (d.relationCount) counts[d.relationCount.relation] = true
    else if (d.relationPath) include[d.relationPath] = true
    else if (d.relationSome) include[d.relationSome.relation] = true
  }
  if (Object.keys(counts).length) include._count = { select: counts }
  return Object.keys(include).length ? { include } : {}
}

export interface ObjectQueryResult {
  ids: string[]
  total: number
  /** False when PREFILTER_CAP truncated the scan — render the total as "≥ N". */
  exact: boolean
  /** Conditions that could not reach the database, for the UI to surface. */
  warnings: FilterExplanation["untranslatable"]
}

/**
 * Every record id matching a filter, for any object.
 *
 * Pure SQL when the whole filter translates — which is the common case, and the
 * only case for the large objects, since relation counts exist only on Locations
 * (770 rows) and Providers (1,234).
 */
export async function queryObjectIds(
  objectType: string,
  state: FilterState | null | undefined,
  opts: { defs?: ObjectFieldDef[] } = {},
): Promise<ObjectQueryResult> {
  const defs = opts.defs ?? (await fieldsFor(objectType))
  const fields = toFilterFields(defs)
  const model = delegateFor(objectType)
  if (!model) return { ids: [], total: 0, exact: true, warnings: [] }

  const { where, explanation, scope } = await buildObjectWhere(objectType, state, fields)
  const warnings = explanation.untranslatable

  if (!warnings.length) {
    const rows = await model.findMany({ where, select: { id: true } })
    const ids = rows.map((r: any) => r.id)
    return { ids, total: ids.length, exact: true, warnings }
  }

  // Something has to be refined in memory. Inside a negated group the SQL half
  // cannot be relaxed without widening the answer, so the filter is evaluated
  // over the object's full scope instead.
  const base = untranslatableUnderNot(state, explanation) ? scope.where : where
  const rows = await model.findMany({ ...refineArgs(defs), where: base, take: PREFILTER_CAP })
  const exact = rows.length < PREFILTER_CAP
  const ids = rows.filter((r: any) => matchesFilter(r, state as FilterState, fields)).map((r: any) => r.id)
  return { ids, total: ids.length, exact, warnings }
}

/** Just the size — same set as queryObjectIds, by construction. */
export async function countObjectMatches(
  objectType: string,
  state: FilterState | null | undefined,
  opts: { defs?: ObjectFieldDef[] } = {},
): Promise<{ total: number; exact: boolean; warnings: FilterExplanation["untranslatable"] }> {
  const defs = opts.defs ?? (await fieldsFor(objectType))
  const fields = toFilterFields(defs)
  const model = delegateFor(objectType)
  if (!model) return { total: 0, exact: true, warnings: [] }

  const { where, explanation } = await buildObjectWhere(objectType, state, fields)
  if (!explanation.untranslatable.length) {
    return { total: await model.count({ where }), exact: true, warnings: [] }
  }
  const r = await queryObjectIds(objectType, state, { defs })
  return { total: r.total, exact: r.exact, warnings: r.warnings }
}
