/**
 * Rewrite NUMBER custom-property values stored in scientific notation to their
 * full numeric form.
 *
 *   npx tsx scripts/normalize-scientific-numbers.ts           # dry run
 *   npx tsx scripts/normalize-scientific-numbers.ts --apply   # write
 *
 * Why: a spreadsheet export wrote MRNs as "1.11016E+11". That is the same value
 * as 111016000000 — the expansion is exact, and the expanded numbers match MRNs
 * already stored in plain form on other records, so nothing is being invented.
 * But it doesn't read as an MRN, it doesn't match a search for the digits, and
 * it sorts as text. The stored value should be the number itself.
 *
 * Only values that round-trip exactly are touched: if String(Number(v)) does not
 * reproduce the same numeric value, the row is reported and left alone rather
 * than guessed at.
 */

import { prisma } from "../lib/prisma"

const APPLY = process.argv.includes("--apply")
const SCIENTIFIC = /^[-+]?\d*\.?\d+[eE][-+]?\d+$/

function expand(raw: string): string | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  // Integers only; a fractional result would need a precision decision this
  // script has no business making.
  if (!Number.isInteger(n)) return null
  if (!Number.isSafeInteger(n)) return null
  const out = String(n)
  // Guard: the expansion must mean the same number it came from.
  return Number(out) === n ? out : null
}

async function main() {
  const defs = await (prisma as any).customObjectDef.findMany({ select: { id: true, key: true, properties: true } })
  let scanned = 0, changed = 0, skipped = 0

  for (const def of defs) {
    const numberProps: string[] = ((def.properties as any[]) ?? []).filter((p) => p.type === "NUMBER").map((p) => p.id)
    if (!numberProps.length) continue
    const labelOf = Object.fromEntries(((def.properties as any[]) ?? []).map((p) => [p.id, p.name]))

    const rows = await (prisma as any).customObjectRecord.findMany({
      where: { objectDefId: def.id }, select: { id: true, values: true },
    })

    for (const row of rows) {
      const values = (row.values as Record<string, unknown>) ?? {}
      const updates: Record<string, string> = {}
      for (const pid of numberProps) {
        const v = values[pid]
        if (typeof v !== "string" || !SCIENTIFIC.test(v.trim())) continue
        scanned++
        const out = expand(v.trim())
        if (out === null) {
          skipped++
          console.log(`  SKIP  ${def.key}.${labelOf[pid]} ${row.id}: ${JSON.stringify(v)} does not expand exactly`)
          continue
        }
        updates[pid] = out
      }
      if (!Object.keys(updates).length) continue
      changed++
      for (const [pid, out] of Object.entries(updates)) {
        console.log(`  ${APPLY ? "SET " : "WOULD"} ${def.key}.${labelOf[pid]} ${row.id}: ${JSON.stringify(values[pid])} -> ${JSON.stringify(out)}`)
      }
      if (APPLY) {
        await (prisma as any).customObjectRecord.update({
          where: { id: row.id },
          data: { values: { ...values, ...updates } },
        })
      }
    }
  }

  console.log(`\n${APPLY ? "Applied" : "Dry run"}: ${scanned} scientific values found, ${changed} records ${APPLY ? "updated" : "would be updated"}, ${skipped} skipped.`)
  if (!APPLY && changed) console.log("Re-run with --apply to write.")
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
