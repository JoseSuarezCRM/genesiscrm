/**
 * Pipeline / Stage placement for imported custom-object records
 * (lib/import-stage.ts), against the real pipelines.
 *
 *   npx tsx --env-file=.env.local scripts/check-import-stage.ts
 *
 * Objects and pipelines are read from the database, not listed by hand. The one
 * part that writes runs inside a transaction that is always rolled back.
 */
import { prisma } from "../lib/prisma"
import { pipelinesForObject, logStageTransition } from "../lib/stages/core"
import { resolveImportStage, applyImportStage, revertImportStage, type ImportPipeline } from "../lib/import-stage"

class Rollback extends Error {}
let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
}
const at = (r: any) => ("pipelineId" in r ? `${r.pipelineId}/${r.stageId}` : "error" in r ? `error: ${r.error}` : "unchanged")
const flip = (s: string) => s.split("").map((c, i) => (i % 2 ? c.toLowerCase() : c.toUpperCase())).join("")

async function main() {
  // Synthetic: the one shape the database doesn't have — a stage name that is in
  // two pipelines but not the default.
  const syn: ImportPipeline[] = [
    { id: "A", name: "Alpha", stages: [{ id: "a1", name: "Open" }] },
    { id: "B", name: "Beta", stages: [{ id: "b1", name: "Shared" }] },
    { id: "C", name: "Gamma", stages: [{ id: "c1", name: "Shared" }] },
  ]
  const amb = resolveImportStage(syn, "", "shared", null)
  check("a stage in two non-default pipelines is ambiguous, naming both", "error" in amb && amb.error.includes("Beta") && amb.error.includes("Gamma"), amb)
  check("…and resolves once the pipeline is given", at(resolveImportStage(syn, "gamma", "SHARED", null)) === "C/c1")
  check("an object with no pipelines: blank cells leave a new record unplaced", at(resolveImportStage([], "", "", null)) === "unchanged")
  check("…and a Pipeline cell is an error", "error" in resolveImportStage([], "Alpha", "", null))

  const defs = await (prisma as any).customObjectDef.findMany({ select: { key: true, plural: true } })
  let objectsWithPipelines = 0
  for (const d of defs) {
    const type = `CO:${d.key}`
    const all: ImportPipeline[] = (await pipelinesForObject(type)).map((p) => ({ id: p.id, name: p.name, stages: p.stages.map((s) => ({ id: s.id, name: s.name })) }))
    const usable = all.filter((p) => p.stages.length)
    if (!usable.length) continue
    objectsWithPipelines++
    const def = usable[0]
    console.log(`\n${d.plural}: ${all.map((p) => `${p.name} [${p.stages.map((s) => s.name).join(", ")}]`).join(" · ")}`)

    // The user's rule: nothing in the file → default pipeline, first stage.
    check("new record, no Pipeline/Stage → default pipeline, first stage", at(resolveImportStage(all, "", "", null)) === `${def.id}/${def.stages[0].id}`)
    check("existing record, no Pipeline/Stage → unchanged", at(resolveImportStage(all, "", "", { pipelineId: def.id, stageId: def.stages[0].id })) === "unchanged")

    for (const p of usable) {
      check(`"${flip(p.name)}" alone → ${p.name}, first stage`, at(resolveImportStage(all, flip(p.name), "", null)) === `${p.id}/${p.stages[0].id}`)
      check(`existing record already in ${p.name}, Pipeline only → unchanged`, at(resolveImportStage(all, p.name, "", { pipelineId: p.id, stageId: p.stages[p.stages.length - 1].id })) === "unchanged")
      for (const s of p.stages) {
        check(`${p.name} / ${flip(s.name)} → that stage`, at(resolveImportStage(all, p.name, flip(s.name), null)) === `${p.id}/${s.id}`)
        check(`by ids ${p.name} / ${s.name}`, at(resolveImportStage(all, p.id, s.id, null)) === `${p.id}/${s.id}`)
        // A stage on its own: the record's own pipeline wins over the default.
        check(`existing in ${p.name}, Stage "${s.name}" only → stays in ${p.name}`, at(resolveImportStage(all, "", s.name, { pipelineId: p.id, stageId: null })) === `${p.id}/${s.id}`)
      }
      const bad = resolveImportStage(all, p.name, "No Such Stage", null)
      check(`unknown stage in ${p.name} → error listing its stages`, "error" in bad && p.stages.every((s) => bad.error.includes(s.name)), bad)
    }
    // A new record with a Stage only looks in the default pipeline first.
    for (const s of def.stages) {
      check(`new record, Stage "${s.name}" only → default pipeline ${def.name}`, at(resolveImportStage(all, "", s.name, null)) === `${def.id}/${s.id}`)
    }
    const unknown = resolveImportStage(all, "No Such Pipeline", "", null)
    check("unknown pipeline → error listing the pipelines", "error" in unknown && usable.every((p) => unknown.error.includes(p.name)), unknown)
    for (const empty of all.filter((p) => !p.stages.length)) {
      const r = resolveImportStage(all, empty.name, "", null)
      check(`"${empty.name}" has no stages → error`, "error" in r && r.error.includes("no stages"), r)
    }
  }
  check(`at least one object has pipelines to test against (${objectsWithPipelines})`, objectsWithPipelines > 0)

  // Apply + Undo, inside a transaction that is always rolled back.
  const target = await (prisma as any).pipeline.findFirst({ where: { objectType: { startsWith: "CO:" }, stages: { some: {} } }, include: { stages: { orderBy: { order: "asc" } } } })
  if (!target) return
  const key = target.objectType.slice(3)
  try {
    await (prisma as any).$transaction(async (tx: any) => {
      console.log(`\nApply and undo (${target.objectType}, rolled back)`)
      const def = await tx.customObjectDef.findUnique({ where: { key }, select: { id: true } })
      const rec = await tx.customObjectRecord.create({ data: { objectDefId: def.id, recordNumber: 990001, values: { synthetic: true } }, select: { id: true } })
      const first = target.stages[0], last = target.stages[target.stages.length - 1]

      const snap = await applyImportStage(target.objectType, rec.id, { pipelineId: target.id, stageId: first.id }, { pipelineId: null, stageId: null }, null, tx)
      const after = await tx.customObjectRecord.findUnique({ where: { id: rec.id }, select: { pipelineId: true, stageId: true } })
      check("an import move places the record and logs a transition", after.stageId === first.id && typeof snap?.__transitionId === "string", { after, snap })
      check("…and remembers where it was", snap?.__pipelineId === null && snap?.__stageId === null)
      check("moving to where it already is logs nothing", (await applyImportStage(target.objectType, rec.id, { pipelineId: target.id, stageId: first.id }, { pipelineId: target.id, stageId: first.id }, null, tx)) === null)

      check("undo reverts it while it is still the latest move", await revertImportStage(target.objectType, rec.id, snap!, tx))
      const reverted = await tx.customObjectRecord.findUnique({ where: { id: rec.id }, select: { pipelineId: true, stageId: true } })
      const left = await tx.stageTransition.count({ where: { recordId: rec.id } })
      check("…back where it was, its transition gone", reverted.pipelineId === null && reverted.stageId === null && left === 0, { reverted, left })

      const snap2 = await applyImportStage(target.objectType, rec.id, { pipelineId: target.id, stageId: first.id }, { pipelineId: null, stageId: null }, null, tx)
      await new Promise((r) => setTimeout(r, 15)) // a later enteredAt for the next move
      if (last.id !== first.id) {
        await logStageTransition(target.objectType, rec.id, target.id, last.id, null, tx)
        check("undo leaves the record alone once someone has moved it since", !(await revertImportStage(target.objectType, rec.id, snap2!, tx)))
        const kept = await tx.customObjectRecord.findUnique({ where: { id: rec.id }, select: { stageId: true } })
        check("…their move stands", kept.stageId === last.id)
      }
      throw new Rollback()
    }, { timeout: 60_000, maxWait: 15_000 })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  check("rolled back — the synthetic record is gone", !(await (prisma as any).customObjectRecord.findFirst({ where: { recordNumber: 990001, values: { path: ["synthetic"], equals: true } } })))
}

main()
  .catch((e) => { failures++; console.error("ERROR", e instanceof Error ? e.stack : e) })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
    process.exit(failures ? 1 : 0)
  })
