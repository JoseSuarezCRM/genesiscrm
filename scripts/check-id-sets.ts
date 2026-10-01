/**
 * lib/id-sets.ts against brute force: every operation must give exactly the
 * set it claims, and every result must fit in half the universe.
 *
 *   npx tsx scripts/check-id-sets.ts
 */
import { andSets, orSets, notSet, compact, fromMatches, materialize, type IdSet } from "../lib/id-sets"

let seed = 20261001
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const sorted = (a: string[]) => [...a].sort()
const same = (a: string[], b: string[]) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

let failures = 0, checks = 0
function check(ok: boolean, what: string) { checks++; if (!ok) { failures++; if (failures < 10) console.error("FAIL", what) } }

for (let trial = 0; trial < 3000; trial++) {
  const n = Math.floor(rnd() * 60)
  const universe = Array.from({ length: n }, (_, i) => `r${i}`)
  const pick = () => universe.filter(() => rnd() < rnd())
  const asSet = (m: string[]): IdSet => (rnd() < 0.5 ? fromMatches(m, universe) : { ids: m, negate: false })
  const A = pick(), B = pick()
  const a = asSet(A), b = asSet(B)
  const and = andSets(a, b, universe), or = orSets(a, b, universe), not = notSet(a)
  check(same(materialize(a, universe), A), `fromMatches keeps the set (n=${n})`)
  check(same(materialize(and, universe), A.filter((x) => B.includes(x))), `AND (n=${n})`)
  check(same(materialize(or, universe), Array.from(new Set([...A, ...B]))), `OR (n=${n})`)
  check(same(materialize(not, universe), universe.filter((x) => !A.includes(x))), `NOT (n=${n})`)
  check(same(materialize(andSets(not, b, universe), universe), B.filter((x) => !A.includes(x))), `NOT A AND B (n=${n})`)
  check(same(materialize(orSets(not, notSet(b), universe), universe), universe.filter((x) => !A.includes(x) || !B.includes(x))), `NOT A OR NOT B (n=${n})`)
  for (const s of [and, or, compact(not, universe), fromMatches(A, universe)]) check(s.ids.length * 2 <= n, `fits in half the universe (n=${n})`)

  // Without a universe (matches together at most half the scope): still exact,
  // and nothing grows beyond the sum of the matches.
  if ((A.length + B.length) * 2 <= n) {
    const a0 = fromMatches(A, null), b0 = fromMatches(B, null)
    const and0 = andSets(a0, b0, null), or0 = orSets(a0, b0, null)
    const nor0 = andSets(notSet(a0), notSet(b0), null), mix0 = orSets(a0, notSet(b0), null)
    check(same(materialize(and0, universe), A.filter((x) => B.includes(x))), `AND, no universe (n=${n})`)
    check(same(materialize(or0, universe), Array.from(new Set([...A, ...B]))), `OR, no universe (n=${n})`)
    check(same(materialize(nor0, universe), universe.filter((x) => !A.includes(x) && !B.includes(x))), `NOT A AND NOT B, no universe (n=${n})`)
    check(same(materialize(mix0, universe), universe.filter((x) => A.includes(x) || !B.includes(x))), `A OR NOT B, no universe (n=${n})`)
    for (const s of [and0, or0, nor0, mix0]) check(s.ids.length * 2 <= n, `bounded without a universe (n=${n})`)
  }
}
console.log(failures === 0 ? `PASSED — ${checks} checks` : `${failures} FAILED of ${checks}`)
process.exit(failures ? 1 : 0)
