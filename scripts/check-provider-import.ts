/**
 * End-to-end check of the Providers import (lib/import-providers.ts): matching,
 * coercion, practice creation, location links, unique values, modes and Undo.
 *
 *   npx tsx --env-file=.env.local scripts/check-provider-import.ts
 *
 * Local dev points at the PRODUCTION database. Everything this writes is named
 * ZZTEST…, and the `finally` block deletes all of it — including the two
 * temporary provider properties, which are visible in Settings for the few
 * seconds the check runs. It refuses to run if an Org Name Rule would rewrite a
 * ZZTEST practice name into a real practice.
 */
import { prisma } from "../lib/prisma"
import { applyRules } from "../lib/org-rules-utils"
import { toProperCase } from "../lib/name-format"
import { coerceValue } from "../lib/import-coerce"
import { runProviderImportBatch, undoProviderImportRun, PROVIDER_PRACTICE, PROVIDER_LOCATIONS } from "../lib/import-providers"
import { RECORD_ID_TARGET, PROVIDER_IMPORT_KEY, type ImportConfig, type ImportMode } from "../lib/import-types"

const tag = `ZZTEST ${Date.now().toString(36)}`
const PRACTICE_A = `${tag} Practice A`
const PRACTICE_B = `${tag} Practice B`
const PRACTICE_NEW = `${tag} New Practice`
const NPI = `99${Date.now().toString().slice(-8)}`

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
}

const made = { practices: [] as string[], locations: [] as string[], doctors: [] as string[], props: [] as string[], runs: [] as string[], notes: [] as string[] }

async function run(uid: string, mode: ImportMode, fieldMap: Record<string, string>, rows: Record<string, string>[]) {
  const r = await (prisma as any).importRun.create({ data: { objectKey: PROVIDER_IMPORT_KEY, createdById: uid } })
  made.runs.push(r.id)
  const config: ImportConfig = { fieldMap, assocMap: [], mode }
  return { runId: r.id as string, result: await runProviderImportBatch(config, rows, 0, r.id, uid) }
}

const doctorNamed = (practiceId: string, name: string) =>
  prisma.referringDoctor.findFirst({ where: { practiceId, name: { equals: name, mode: "insensitive" } }, include: { locations: true } })

async function main() {
  const rules = await prisma.orgNameRule.findMany({ orderBy: { order: "asc" } })
  for (const n of [PRACTICE_A, PRACTICE_B, PRACTICE_NEW, PRACTICE_NEW.toUpperCase()]) {
    if (applyRules(n, rules) !== n.trim()) throw new Error(`An Org Name Rule rewrites "${n}" — refusing to run against real practices.`)
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } })
  if (!admin) throw new Error("No admin user to import as.")
  const uid = admin.id

  // Pure: DATE cells land at noon UTC; DATE_TIME stays an instant.
  check("DATE 10/05/2026 → noon UTC", (coerceValue("DATE", "10/05/2026") as any).value === "2026-10-05T12:00:00.000Z")
  check("DATE 2026-10-05 → noon UTC", (coerceValue("DATE", "2026-10-05") as any).value === "2026-10-05T12:00:00.000Z")
  check("DATE garbage → error", "error" in coerceValue("DATE", "not a date"))

  // Fixtures: practices A and B, an office in each, a provider in B holding the NPI.
  const a = await prisma.referringPractice.create({ data: { name: PRACTICE_A } }); made.practices.push(a.id)
  const b = await prisma.referringPractice.create({ data: { name: PRACTICE_B } }); made.practices.push(b.id)
  const la = await prisma.practiceLocation.create({ data: { name: `${tag} North Office`, address: "1 Test Way, Testville", practiceId: a.id } }); made.locations.push(la.id)
  const lb = await prisma.practiceLocation.create({ data: { name: `${tag} South Office`, address: "2 Test Way, Testville", practiceId: b.id } }); made.locations.push(lb.id)
  const pb = await prisma.referringDoctor.create({ data: { name: `${tag} Shared`, npi: NPI, specialty: "Hand", practiceId: b.id } }); made.doctors.push(pb.id)
  const dateProp = await prisma.customProperty.create({ data: { name: `${tag} Date`, type: "DATE", entityType: "PROVIDER" } }); made.props.push(dateProp.id)
  const codeProp = await prisma.customProperty.create({ data: { name: `${tag} Code`, type: "TEXT", entityType: "PROVIDER", unique: true } }); made.props.push(codeProp.id)

  const map1 = {
    Name: "name", Practice: PROVIDER_PRACTICE, NPI: "npi", Office: PROVIDER_LOCATIONS, Email: "email",
    Specialty: "specialty", Started: `cp_${dateProp.id}`, Code: `cp_${codeProp.id}`,
  }
  const blank = { Name: "", Practice: "", NPI: "", Office: "", Email: "", Specialty: "", Started: "", Code: "" }
  const r1 = await run(uid, "upsert", map1, [
    { ...blank, Name: `${tag} alpha`, Practice: PRACTICE_A, NPI, Office: `${tag} north office`, Email: "alpha@example.test", Started: "10/05/2026", Code: `${tag}-C1` },
    { ...blank, Name: `${tag} Beta`, Practice: PRACTICE_NEW, Office: "Nowhere Clinic" },
    { ...blank, Name: `${tag} Gamma`, Practice: PRACTICE_NEW.toUpperCase() },
    { ...blank, Name: `${tag} Delta`, Practice: PRACTICE_A, Email: "not-an-email" },
    { ...blank, Name: `${tag} ALPHA`, Practice: PRACTICE_A, Specialty: "Ortho" },
    { ...blank, Name: `${tag} Eps`, Practice: PRACTICE_A, Code: `${tag}-C1` },
    { ...blank, Practice: PRACTICE_A },
  ])
  const res1 = r1.result
  check("run 1: 3 created, 1 updated, 3 skipped, 1 practice created",
    res1.created === 3 && res1.updated === 1 && res1.skipped === 3 && res1.practicesCreated === 1, res1)
  const msgs = res1.errors.map((e) => `${e.row}:${e.message}`)
  check("bad email skips its row (row 5)", msgs.some((m) => m.startsWith("5:Email")), msgs)
  check("unique value clash skips its row (row 7)", msgs.some((m) => m.startsWith("7:") && m.includes("already uses")), msgs)
  check("missing name skips its row (row 8)", msgs.some((m) => m.startsWith("8:") && m.includes("needs a Name and a Practice")), msgs)
  check("unknown location is reported (row 3)", msgs.some((m) => m.startsWith("3:Location")), msgs)

  const alpha = await doctorNamed(a.id, `${tag} alpha`)
  if (alpha) made.doctors.push(alpha.id)
  check("alpha created in practice A, proper-cased", !!alpha && alpha.name === toProperCase(`${tag} alpha`), alpha?.name)
  check("alpha's NPI did not match the provider in practice B", !!alpha && alpha.id !== pb.id && alpha.npi === NPI)
  check("alpha linked to the North Office by name", !!alpha && alpha.locations.some((l) => l.locationId === la.id))
  const bag = (alpha?.customProperties as Record<string, unknown>) ?? {}
  check("DATE property stored at noon UTC", bag[dateProp.id] === "2026-10-05T12:00:00.000Z", bag)
  check("repeated row updated alpha (specialty)", alpha?.specialty === "Ortho", alpha?.specialty)
  check("owner defaults to the importer", alpha?.ownerId === uid)

  const created = await prisma.referringPractice.findMany({ where: { name: { equals: PRACTICE_NEW, mode: "insensitive" } }, select: { id: true } })
  made.practices.push(...created.map((p) => p.id))
  check("new practice created exactly once", created.length === 1, created.length)
  const beta = created[0] ? await doctorNamed(created[0].id, `${tag} Beta`) : null
  const gamma = created[0] ? await doctorNamed(created[0].id, `${tag} Gamma`) : null
  if (beta) made.doctors.push(beta.id)
  if (gamma) made.doctors.push(gamma.id)
  check("beta and gamma share the new practice", !!beta && !!gamma)
  check("beta imported without a location link", !!beta && beta.locations.length === 0)
  const pbAfter1 = await prisma.referringDoctor.findUnique({ where: { id: pb.id } })
  check("provider in practice B untouched by run 1", pbAfter1?.specialty === "Hand" && pbAfter1?.title === null)

  // Run 2: NPI match within practice B (blank cell keeps the old value, new office linked by
  // address), and a Record ID match naming a different practice (updated, not moved).
  const map2 = { "Record ID": RECORD_ID_TARGET, Practice: PROVIDER_PRACTICE, NPI: "npi", Title: "title", Specialty: "specialty", Office: PROVIDER_LOCATIONS }
  const r2 = await run(uid, "upsert", map2, [
    { "Record ID": "", Practice: PRACTICE_B, NPI, Title: "MD", Specialty: "", Office: "2 test way, testville" },
    { "Record ID": alpha?.id ?? "", Practice: PRACTICE_B, NPI: "", Title: "DO", Specialty: "", Office: "" },
  ])
  check("run 2: 2 updated, nothing created", r2.result.updated === 2 && r2.result.created === 0, r2.result)
  const pbAfter2 = await prisma.referringDoctor.findUnique({ where: { id: pb.id }, include: { locations: true } })
  check("NPI within practice B updated the right provider", pbAfter2?.title === "MD")
  check("blank cell kept the old value", pbAfter2?.specialty === "Hand", pbAfter2?.specialty)
  check("office linked by address", !!pbAfter2?.locations.some((l) => l.locationId === lb.id))
  const alpha2 = alpha ? await prisma.referringDoctor.findUnique({ where: { id: alpha.id } }) : null
  check("Record ID row updated alpha but kept its practice", alpha2?.title === "DO" && alpha2?.practiceId === a.id)
  check("different practice is reported", r2.result.errors.some((e) => e.row === 3 && e.message.includes("differs")), r2.result.errors)

  // Modes.
  const r3 = await run(uid, "createOnly", { Name: "name", Practice: PROVIDER_PRACTICE }, [{ Name: `${tag} alpha`, Practice: PRACTICE_A }])
  check("createOnly skips an existing provider", r3.result.skipped === 1 && r3.result.created === 0, r3.result)
  const r4 = await run(uid, "updateOnly", { Name: "name", Practice: PROVIDER_PRACTICE }, [{ Name: `${tag} Zeta`, Practice: PRACTICE_A }])
  check("updateOnly skips a new provider", r4.result.skipped === 1 && r4.result.created === 0, r4.result)

  // Undo run 2: restores the fields it wrote and removes the link it added.
  const u2 = await undoProviderImportRun(r2.runId)
  const pbAfterUndo = await prisma.referringDoctor.findUnique({ where: { id: pb.id }, include: { locations: true } })
  check("undo run 2: title restored, link removed", pbAfterUndo?.title === null && !pbAfterUndo?.locations.some((l) => l.locationId === lb.id), u2)
  const alphaUndo = alpha ? await prisma.referringDoctor.findUnique({ where: { id: alpha.id } }) : null
  check("undo run 2: alpha's title restored", alphaUndo?.title === null, alphaUndo?.title)

  // Gamma gains a note before Undo, so it — and the practice it sits in — must be kept.
  if (gamma) {
    const note = await prisma.providerNote.create({ data: { content: "ZZTEST note", providerId: gamma.id, createdById: uid } })
    made.notes.push(note.id)
  }
  const u1 = await undoProviderImportRun(r1.runId)
  check("undo run 1: 2 providers deleted, gamma + its practice kept", u1.deleted === 2 && u1.kept === 2, u1)
  check("undo run 1: alpha and beta are gone",
    !(await prisma.referringDoctor.findFirst({ where: { id: { in: [alpha?.id ?? "-", beta?.id ?? "-"] } } })))
  check("undo run 1: gamma still exists", !!(gamma && (await prisma.referringDoctor.findUnique({ where: { id: gamma.id } }))))
  check("undo run 1: provider in practice B survives", !!(await prisma.referringDoctor.findUnique({ where: { id: pb.id } })))
}

async function cleanup() {
  await prisma.providerNote.deleteMany({ where: { id: { in: made.notes } } }).catch(() => {})
  const doctors = await prisma.referringDoctor.findMany({ where: { OR: [{ id: { in: made.doctors } }, { name: { startsWith: tag, mode: "insensitive" } }] }, select: { id: true } })
  await prisma.referringDoctor.deleteMany({ where: { id: { in: doctors.map((d) => d.id) } } }).catch((e) => console.error("cleanup doctors:", e.message))
  await prisma.practiceLocation.deleteMany({ where: { id: { in: made.locations } } }).catch((e) => console.error("cleanup locations:", e.message))
  await prisma.referringPractice.deleteMany({ where: { OR: [{ id: { in: made.practices } }, { name: { startsWith: tag, mode: "insensitive" } }] } }).catch((e) => console.error("cleanup practices:", e.message))
  await prisma.customProperty.deleteMany({ where: { id: { in: made.props } } }).catch((e) => console.error("cleanup props:", e.message))
  await (prisma as any).importRunChange.deleteMany({ where: { runId: { in: made.runs } } }).catch(() => {})
  await (prisma as any).importRunAssoc.deleteMany({ where: { runId: { in: made.runs } } }).catch(() => {})
  await (prisma as any).importRun.deleteMany({ where: { id: { in: made.runs } } }).catch(() => {})
  const left = await prisma.referringPractice.count({ where: { name: { startsWith: tag, mode: "insensitive" } } })
    + await prisma.referringDoctor.count({ where: { name: { startsWith: tag, mode: "insensitive" } } })
    + await prisma.customProperty.count({ where: { id: { in: made.props } } })
  console.log(left ? `CLEANUP INCOMPLETE — ${left} ZZTEST row(s) left (${tag})` : "cleaned up")
  if (left) failures++
}

main()
  .catch((e) => { failures++; console.error("ERROR", e instanceof Error ? e.message : e) })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
    console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED")
    process.exit(failures ? 1 : 0)
  })
