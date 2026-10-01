/**
 * Sets of record ids, kept small enough to send to Postgres.
 *
 * Custom-property conditions are answered in raw SQL as lists of matching ids
 * (lib/json-predicate.ts) and sent back as `id IN (…)` — one bind variable per
 * id, and Postgres refuses a statement with more than 32,767. On a 14,851-row
 * object a single broad condition ("first name doesn't contain X") matched
 * 14,851 ids, and four of them in one filter sent 34,101.
 *
 * Two rules keep a filter far below that:
 * - Every set is stored as whichever list is shorter: the ids that match, or
 *   the ids in scope that don't (`negate`, sent as `id NOT IN (…)`). Never more
 *   than half the object.
 * - Sets in the same group, and groups made only of such sets, are combined
 *   here in memory into one set, so a filter sends one list, not one per
 *   condition.
 *
 * Exact set algebra within the scope's universe — no approximation.
 *
 * The universe (every id in scope) is only needed to flip a set to its shorter
 * form, and fetching it costs a query over the whole object. It is null when
 * the matched sets together are at most half the scope: then no result of
 * these operations can exceed that sum, so nothing ever needs flipping.
 */

/** Every id in scope, or null when it wasn't needed (see above). */
export type Universe = readonly string[] | null

export interface IdSet {
  ids: string[]
  /** true: every row in scope EXCEPT `ids`. */
  negate: boolean
}

/** Bind variables Postgres allows in one statement. */
export const PG_MAX_BIND_VARIABLES = 32_767

const diff = (a: string[], b: string[]) => { const s = new Set(b); return a.filter((x) => !s.has(x)) }
const inter = (a: string[], b: string[]) => { const s = new Set(b); return a.filter((x) => s.has(x)) }
const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]))

/** The shorter of the two equivalent forms. */
export function compact(s: IdSet, universe: Universe): IdSet {
  if (!universe || s.ids.length * 2 <= universe.length) return s
  return { ids: diff([...universe], s.ids), negate: !s.negate }
}

export function fromMatches(matches: string[], universe: Universe): IdSet {
  return compact({ ids: matches, negate: false }, universe)
}

export function notSet(s: IdSet): IdSet {
  return { ids: s.ids, negate: !s.negate }
}

export function andSets(a: IdSet, b: IdSet, universe: Universe): IdSet {
  const r: IdSet =
    !a.negate && !b.negate ? { ids: inter(a.ids, b.ids), negate: false }
      : !a.negate && b.negate ? { ids: diff(a.ids, b.ids), negate: false }
      : a.negate && !b.negate ? { ids: diff(b.ids, a.ids), negate: false }
      : { ids: union(a.ids, b.ids), negate: true }
  return compact(r, universe)
}

export function orSets(a: IdSet, b: IdSet, universe: Universe): IdSet {
  const r: IdSet =
    !a.negate && !b.negate ? { ids: union(a.ids, b.ids), negate: false }
      : !a.negate && b.negate ? { ids: diff(b.ids, a.ids), negate: true }
      : a.negate && !b.negate ? { ids: diff(a.ids, b.ids), negate: true }
      : { ids: inter(a.ids, b.ids), negate: true }
  return compact(r, universe)
}

export function idSetWhere(s: IdSet): Record<string, unknown> {
  return s.negate ? { id: { notIn: s.ids } } : { id: { in: s.ids } }
}

/** Every element of `universe` the set contains — for tests. */
export function materialize(s: IdSet, universe: readonly string[]): string[] {
  return s.negate ? diff([...universe], s.ids) : inter([...universe], s.ids)
}
