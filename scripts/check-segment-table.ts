/**
 * The segment record table (lib/segment-table.ts) against the real database.
 * Read-only: nothing here writes.
 *
 *   npx tsx --env-file=.env.local scripts/check-segment-table.ts
 *
 * Object types are enumerated from the registry and segments from the table —
 * never a hand-written list (see feedback: derive, never list).
 */
import { prisma } from "../lib/prisma"
import { listObjectTypes } from "../lib/object-registry"
import { delegateFor, isCustomObject } from "../lib/automation-records"
import { segmentRecordIds } from "../lib/segments"
import { fieldsFor } from "../lib/object-fields-server"
import { defaultSegmentColumns, loadSegmentRows, resolveSegmentColumns, segmentColumnCatalog, displayCell } from "../lib/segment-table"

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ""}`)
}

async function main() {
  // Pure formatting.
  const sel = { key: "s", label: "S", type: "select" as const, source: "X", column: "s", options: [{ value: "sent_to_surgeon", label: "Text sent to surgeon" }] }
  check("select shows the option label", displayCell("sent_to_surgeon", sel) === "Text sent to surgeon")
  check("multi-select shows labels", displayCell(["sent_to_surgeon", "other"], sel) === "Text sent to surgeon, other")
  const date = { key: "d", label: "D", type: "date" as const, source: "X", column: "d" }
  check("calendar day at noon UTC keeps its day", displayCell("2026-10-05T12:00:00.000Z", date) === "Oct 5, 2026")
  check("an evening instant shows its Chicago day", displayCell("2026-10-06T02:30:00.000Z", date) === "Oct 5, 2026", displayCell("2026-10-06T02:30:00.000Z", date))
  check("checkbox → Yes/No", displayCell(true, { ...date, type: "boolean" }) === "Yes" && displayCell(false, { ...date, type: "boolean" }) === "No")
  check("currency", displayCell(1234.5, { ...date, type: "number", numberFormat: "currency" }) === "$1,234.50")

  const types = (await listObjectTypes()).map((t) => t.key)
  console.log(`\n${types.length} object types: ${types.join(", ")}`)

  for (const type of types) {
    const catalog = await segmentColumnCatalog(type)
    const keys = new Set(catalog.map((c) => c.key))

    // Every custom property of the object is offered.
    let propKeys: string[]
    if (isCustomObject(type)) {
      const def = await (prisma as any).customObjectDef.findUnique({ where: { key: type.slice(3) }, select: { properties: true } })
      propKeys = ((def?.properties as any[]) ?? []).map((p) => p.id)
    } else {
      const cps = await prisma.customProperty.findMany({ where: { entityType: type as any }, select: { id: true } }).catch(() => [])
      propKeys = cps.map((p) => `cp_${p.id}`)
    }
    const missing = propKeys.filter((k) => !keys.has(k))
    check(`${type}: all ${propKeys.length} custom properties offered`, missing.length === 0, missing)
    check(`${type}: keys unique`, keys.size === catalog.length)

    // Defaults never repeat the id or what the row's name is made of (recordLabel:
    // the patient name for referrals and surgery, a task's title, `name` otherwise,
    // and a custom object's primary property or first/last name).
    const defaults = await defaultSegmentColumns(type, catalog)
    const nameFields = type === "REFERRAL" ? ["patientFirstName", "patientLastName"]
      : type === "SURGERY" ? ["patientName"] : type === "TASK" ? ["title"] : ["name"]
    const nameish = defaults.filter((d) => d.key === "__id" || nameFields.includes(d.key))
    check(`${type}: default columns (${defaults.map((d) => d.label).join(", ")}) skip the name`, nameish.length === 0, nameish.map((d) => d.key))

    // Load real records with EVERY column — exercises every join the catalog can ask for.
    const model = delegateFor(type)
    let where: any = {}
    if (isCustomObject(type)) {
      const def = await (prisma as any).customObjectDef.findUnique({ where: { key: type.slice(3) }, select: { id: true } })
      where = { objectDefId: def?.id ?? "-" }
    }
    const sample: string[] = (await model.findMany({ where, select: { id: true }, take: 25, orderBy: { id: "asc" } })).map((r: any) => r.id)
    if (!sample.length) { console.log(`     ${type}: no records to load`); continue }
    const rows = await loadSegmentRows(type, [...sample].reverse(), catalog)
    check(`${type}: ${rows.length} rows come back in the requested order`, rows.map((r) => r.id).join() === [...sample].reverse().join())
    check(`${type}: every row has a name`, rows.every((r) => r.label && r.label.trim().length > 0))
    check(`${type}: one cell per column`, rows.every((r) => r.cells.length === catalog.length))

    // Derived, not listed: a default column whose value IS the row's name on every
    // row is the name repeated (catches a custom object's primary or name parts).
    const repeats = defaults.filter((d) => {
      const i = catalog.findIndex((c) => c.key === d.key)
      const filled = rows.filter((r) => r.cells[i])
      return filled.length > 0 && filled.every((r) => r.cells[i] === r.label)
    })
    check(`${type}: no default column just repeats the name`, repeats.length === 0, repeats.map((d) => d.label))

    // Select cells show labels, never a stored value that has a different label.
    const leaks: string[] = []
    catalog.forEach((c, i) => {
      if (c.type !== "select" || !c.options?.length) return
      for (const r of rows) {
        const raw = c.options.find((o) => o.value === r.cells[i] && o.label !== o.value)
        if (raw) leaks.push(`${c.label}=${r.cells[i]}`)
      }
    })
    check(`${type}: select cells show labels`, leaks.length === 0, leaks.slice(0, 5))

    // Joined name columns resolve wherever the foreign key is set.
    for (let i = 0; i < catalog.length; i++) {
      const c = catalog[i]
      if (!c.joinPath) continue
      const fk = c.joinPath === "owner" ? "ownerId" : `${c.joinPath}Id`
      const recs: any[] = await model.findMany({ where: { id: { in: sample } }, select: { id: true, [fk]: true } }).catch(() => [])
      if (!recs.length || !(fk in recs[0])) continue
      const withFk = new Set(recs.filter((r) => r[fk]).map((r) => r.id))
      const blank = rows.filter((r) => withFk.has(r.id) && !r.cells[i]).length
      check(`${type}: "${c.label}" filled on all ${withFk.size} rows that have one`, blank === 0, blank)
    }
  }

  console.log("\nSaved columns")
  const anyType = types.find((t) => isCustomObject(t)) ?? types[0]
  const cat = await segmentColumnCatalog(anyType)
  const def = await defaultSegmentColumns(anyType, cat)
  check("never configured → the default set", (await resolveSegmentColumns(anyType, null, cat)).map((c) => c.key).join() === def.map((c) => c.key).join())
  check("saved empty list → just the name", (await resolveSegmentColumns(anyType, [], cat)).length === 0)
  check("a deleted property drops out, order kept",
    (await resolveSegmentColumns(anyType, ["__gone__", cat[2]?.key, cat[1]?.key], cat)).map((c) => c.key).join() === [cat[2]?.key, cat[1]?.key].join())

  console.log("\nEvery segment loads in full (what Export reads)")
  const segments = await (prisma as any).segment.findMany({ select: { id: true, name: true, objectType: true, kind: true, source: true, filter: true, sourceConfig: true, columns: true } })
  for (const seg of segments) {
    const r = await segmentRecordIds(seg, await fieldsFor(seg.objectType))
    const catalog = await segmentColumnCatalog(seg.objectType)
    const columns = await resolveSegmentColumns(seg.objectType, seg.columns, catalog)
    let n = 0
    for (let i = 0; i < r.ids.length; i += 1000) n += (await loadSegmentRows(seg.objectType, r.ids.slice(i, i + 1000), columns)).length
    check(`"${seg.name}" (${seg.objectType}): ${n} of ${r.total} rows`, n === r.ids.length && (!r.exact || n === r.total), { n, ids: r.ids.length, total: r.total })
  }
}

main()
  .catch((e) => { failures++; console.error("ERROR", e instanceof Error ? e.stack : e) })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
    process.exit(failures ? 1 : 0)
  })
