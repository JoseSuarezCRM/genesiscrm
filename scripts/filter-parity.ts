/**
 * Differential test: the in-memory filter evaluator vs the SQL translation.
 *
 *   npx tsx scripts/filter-parity.ts            # every object
 *   npx tsx scripts/filter-parity.ts REFERRAL   # one object
 *
 * Read-only. It never writes.
 *
 * Why this exists: `matchesFilter` (lib/filters) and `filterStateToWhere`
 * (lib/filter-to-prisma) are two independent implementations of the same filter
 * model, and which one runs depends on the list and its row count. They had
 * already diverged — Postgres drops NULL rows from a negated comparison while
 * the in-memory side reads null as "" and keeps them, which hid 8,566 referrals
 * from "email doesn't contain gmail".
 *
 * Every table here is small enough (largest ~17.6k) to compare id sets
 * exhaustively rather than sampling, so a green run is a proof, not evidence.
 *
 * Conditions the translator legitimately cannot express (relation counts, typed
 * operators on JSON-bag properties) are not failures — they're classified by
 * explainFilterState and reported separately, and the assertion is that the set
 * of them does not grow.
 */

import { prisma } from "../lib/prisma"
import { OPERATORS, matchesFilter, type Condition, type FilterField, type FilterState } from "../lib/filters"
import { filterStateToWhere, explainFilterState } from "../lib/filter-to-prisma"
import { fieldsFor } from "../lib/object-fields-server"
import { toFilterFields, readValueAt, type ObjectFieldDef } from "../lib/object-fields"
import { delegateFor, isCustomObject } from "../lib/automation-records"
import { modelNameFor } from "../lib/object-fields-server"
import { resolveFor, scopeFor } from "../lib/object-query"

const BUILTINS = ["REFERRAL", "PROVIDER", "PRACTICE", "LOCATION", "SURGERY", "ACTIVITY", "TASK"]
const COMBO_COUNT = Number(process.env.COMBOS ?? 300)

let uidN = 0
const uid = () => `x${++uidN}`

function cond(field: string, operator: string, value: string | string[]): Condition {
  return { id: uid(), field, operator, value }
}
function one(c: Condition, not = false): FilterState {
  return { combinator: "AND", groups: [{ id: uid(), combinator: "AND", conditions: [c], not }] }
}

/** Build the Prisma args needed to satisfy every field's readPath. */
function loadArgs(defs: ObjectFieldDef[], objectDefId: string | null) {
  const include: Record<string, unknown> = {}
  const counts: Record<string, boolean> = {}
  for (const d of defs) {
    if (d.relationCount) counts[d.relationCount.relation] = true
    else if (d.relationPath) include[d.relationPath] = true
    else if (d.relationSome) include[d.relationSome.relation] = true
  }
  if (Object.keys(counts).length) include._count = { select: counts }
  return {
    ...(objectDefId ? { where: { objectDefId } } : {}),
    ...(Object.keys(include).length ? { include } : {}),
  }
}

/** Sample operand values for a field from real rows: a common one, a rare one, and a blank. */
function sampleValues(def: ObjectFieldDef, rows: any[]): string[] {
  if (def.type === "boolean") return [""]
  if (def.options?.length) return def.options.slice(0, 3).map((o) => o.value)

  const seen = new Map<string, number>()
  for (const r of rows) {
    const v = readValueAt(r, def.readPath)
    if (v === null || v === undefined || v === "") continue
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
    seen.set(s, (seen.get(s) ?? 0) + 1)
  }
  if (seen.size === 0) return []
  const sorted = Array.from(seen.entries()).sort((a, b) => b[1] - a[1])
  const common = sorted[0][0]
  const rare = sorted[sorted.length - 1][0]

  if (def.type === "text") {
    // A fragment matches many rows; the whole value matches few. Both matter,
    // because `contains` and `is` fail differently.
    const frag = common.length > 3 ? common.slice(0, 3) : common
    return Array.from(new Set([frag, common, rare]))
  }
  return Array.from(new Set([common, rare]))
}

function randomState(defs: ObjectFieldDef[], rows: any[], rnd: () => number): FilterState | null {
  const usable = defs.filter((d) => !d.relationCount)
  if (!usable.length) return null
  const groups = []
  const groupCount = 1 + Math.floor(rnd() * 2)
  for (let g = 0; g < groupCount; g++) {
    const conds: Condition[] = []
    const n = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < n; i++) {
      const def = usable[Math.floor(rnd() * usable.length)]
      const ops = OPERATORS[def.type] ?? []
      const op = ops[Math.floor(rnd() * ops.length)]
      if (!op) continue
      let value: string | string[] = ""
      if (!op.noValue) {
        const vals = sampleValues(def, rows)
        if (!vals.length) continue
        const v = vals[Math.floor(rnd() * vals.length)]
        if (op.multi) value = [v]
        else if (op.range) value = [v, v]
        else if (op.relative) value = "last_90"
        else value = v
      }
      conds.push(cond(def.key, op.value, value))
    }
    if (conds.length) {
      groups.push({ id: uid(), combinator: rnd() < 0.5 ? "OR" as const : "AND" as const, conditions: conds, not: rnd() < 0.3 })
    }
  }
  if (!groups.length) return null
  return { combinator: rnd() < 0.5 ? "OR" : "AND", groups }
}

// Deterministic PRNG so a failure is reproducible.
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Mismatch { state: FilterState; onlyMem: string[]; onlySql: string[] }

/** The tx-scoped delegate for an object, so every query sees one MVCC snapshot. */
function delegateOn(client: any, objectType: string): any {
  if (isCustomObject(objectType)) return client.customObjectRecord
  const model = modelNameFor(objectType)
  if (!model) return null
  return client[model.charAt(0).toLowerCase() + model.slice(1)]
}

async function checkObject(objectType: string) {
  const defs = await fieldsFor(objectType)
  const ff = toFilterFields(defs)
  if (!delegateFor(objectType)) { console.log(`  ${objectType}: no delegate, skipped`); return { checked: 0, mismatches: [] as Mismatch[], skipped: [] as string[] } }

  let objectDefId: string | null = null
  if (isCustomObject(objectType)) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: objectType.slice(3) }, select: { id: true } })
    if (!def) return { checked: 0, mismatches: [], skipped: [] }
    objectDefId = def.id
  }

  // Everything below runs in ONE repeatable-read transaction.
  //
  // This is a live production database and it moves underneath the test: rows
  // arrive from the IntakeQ webhook, and the automation cron walks referrals
  // from NEW to READY_FOR_CALL. Loading a snapshot and then querying outside it
  // reported ~30 "mismatches" that were only the data changing between the two.
  // A shared snapshot makes the comparison mean what it claims.
  return await prisma.$transaction(async (tx) => {
    const model = delegateOn(tx, objectType)
    const args = loadArgs(defs, objectDefId)
    const rows: any[] = await model.findMany(args)
    const scope = objectDefId ? { objectDefId } : {}
    const sc = await scopeFor(objectType)
    const universe = new Set<string>(rows.map((r) => r.id))

    const states: FilterState[] = []
    for (const def of defs) {
      const vals = sampleValues(def, rows)
      for (const op of OPERATORS[def.type] ?? []) {
        if (op.noValue) { states.push(one(cond(def.key, op.value, "")), one(cond(def.key, op.value, ""), true)); continue }
        for (const v of vals.slice(0, 2)) {
          const value: string | string[] = op.multi ? [v] : op.range ? [v, v] : op.relative ? "last_90" : v
          states.push(one(cond(def.key, op.value, value)), one(cond(def.key, op.value, value), true))
        }
      }
    }
    const rnd = mulberry(1234)
    for (let i = 0; i < COMBO_COUNT; i++) { const s = randomState(defs, rows, rnd); if (s) states.push(s) }

    const mismatches: Mismatch[] = []
    const skipped = new Set<string>()
    let checked = 0

    for (const state of states) {
      // Custom-property conditions are resolved in raw SQL first — Prisma's JSON
      // filters are case-sensitive and have no numeric/date operators, so without
      // this the comparison would be testing a path the app no longer takes.
      const resolved = await resolveFor(objectType, state, ff, sc)
      const ex = explainFilterState(state, ff, resolved)
      if (ex.untranslatable.length) {
        for (const u of ex.untranslatable) skipped.add(`${u.label} [${u.operator}] ${u.reason}`)
        continue // not a parity failure — reported separately
      }
      const memIds = rows.filter((r) => matchesFilter(r, state, ff)).map((r) => r.id).sort()
      const where = { ...scope, ...filterStateToWhere(state, ff, resolved) }
      let sqlIds: string[]
      try {
        sqlIds = (await model.findMany({ where, select: { id: true } }))
          .map((r: any) => r.id).filter((id: string) => universe.has(id)).sort()
      } catch (e: any) {
        mismatches.push({ state, onlyMem: [`QUERY REJECTED: ${String(e.message).split("\n").map((l: string) => l.trim()).find((l: string) => /Argument|Unknown/.test(l)) ?? "error"}`], onlySql: [] })
        continue
      }
      checked++
      const memSet = new Set(memIds), sqlSet = new Set(sqlIds)
      const onlyMem = memIds.filter((i) => !sqlSet.has(i))
      const onlySql = sqlIds.filter((i) => !memSet.has(i))
      if (onlyMem.length || onlySql.length) mismatches.push({ state, onlyMem, onlySql })
    }

    return { checked, mismatches, skipped: Array.from(skipped), rows: rows.length, fields: defs.length }
  }, { isolationLevel: "RepeatableRead", timeout: 600_000, maxWait: 30_000 })
}

function describe(state: FilterState): string {
  return state.groups
    .map((g) => `${g.not ? "NOT " : ""}(${g.conditions.map((c) => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`).join(` ${g.combinator} `)})`)
    .join(` ${state.combinator} `)
}

async function main() {
  const only = process.argv[2]
  const custom = await (prisma as any).customObjectDef.findMany({ select: { key: true } }).catch(() => [])
  const all = [...BUILTINS, ...custom.map((c: any) => `CO:${c.key}`)]
  const targets = only ? all.filter((t) => t === only) : all

  let totalMismatch = 0, totalChecked = 0
  for (const t of targets) {
    const r: any = await checkObject(t)
    totalChecked += r.checked
    totalMismatch += r.mismatches.length
    const status = r.mismatches.length === 0 ? "OK  " : "FAIL"
    console.log(`[${status}] ${t.padEnd(22)} ${String(r.checked).padStart(5)} states over ${String(r.rows ?? 0).padStart(6)} rows, ${r.fields ?? 0} fields`)
    for (const s of r.skipped ?? []) console.log(`         untranslatable: ${s}`)
    for (const m of r.mismatches.slice(0, 5)) {
      console.log(`         MISMATCH ${describe(m.state)}`)
      console.log(`           only in memory: ${m.onlyMem.length} ${m.onlyMem.slice(0, 3).join(", ")}`)
      console.log(`           only in SQL:    ${m.onlySql.length} ${m.onlySql.slice(0, 3).join(", ")}`)
    }
    if (r.mismatches.length > 5) console.log(`         … and ${r.mismatches.length - 5} more`)
  }
  console.log(`\n${totalMismatch === 0 ? "PARITY OK" : "PARITY FAILED"} — ${totalChecked} states compared, ${totalMismatch} mismatches`)
  await prisma.$disconnect()
  process.exit(totalMismatch === 0 ? 0 : 1)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
