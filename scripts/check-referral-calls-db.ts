/**
 * Provisioning of the "Referral Calls" object, against the real database schema,
 * inside ONE transaction that is always rolled back — nothing it creates is
 * ever committed.
 *
 *   npx tsx --env-file=.env.local scripts/check-referral-calls-db.ts
 */

import { prisma } from "../lib/prisma"
import { ensureReferralCallObject, getReferralCallDef } from "../lib/referral-calls/provision"
import { RC_PROPERTIES } from "../lib/referral-calls/schema"
import { RC_OBJECT_KEY, RC_PERM_KEY } from "../lib/referral-calls/constants"
import { deriveReferralCallEdit, RC_SERVER_SET_PROPS } from "../lib/referral-calls/inline-edit"

class Rollback extends Error {}

let failures = 0
const eq = (got: unknown, want: unknown, what: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { failures++; console.error(`  FAIL  ${what}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${what}`)
}

async function main() {
  const already = await getReferralCallDef()
  if (already) console.log(`note: "${RC_OBJECT_KEY}" already exists in this database — the create path is checked on a copy-free basis only`)

  try {
    await (prisma as any).$transaction(async (tx: any) => {
      const admin = await tx.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
      if (!admin) throw new Error("no active admin to act as")

      console.log("\nFirst visit")
      const d1 = await ensureReferralCallObject(admin.id, tx)
      const row1 = await tx.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY } })
      eq(row1?.singular, "Referral Call", "object created")
      eq((row1.properties as any[]).length, RC_PROPERTIES.length, "every spec property present")
      eq((row1.properties as any[]).every((p) => p.locked === true), true, "all locked")
      const cards = await tx.recordCard.findMany({ where: { objectType: RC_PERM_KEY }, orderBy: { order: "asc" } })
      eq(cards.map((c: any) => c.cardName), ["call", "patient", "charting", "record-details", "texts", "details", "outcome", "source"], "detail cards seeded")
      const views = await tx.customObjectView.findMany({ where: { objectKey: RC_OBJECT_KEY }, orderBy: { createdAt: "asc" } })
      eq(views.map((v: any) => v.name), ["Awaiting surgeon", "Urgent · last 7 days", "Not charted"], "three shared views")
      eq(views.every((v: any) => v.visibility === "EVERYONE"), true, "views shared with everyone")
      eq(d1.id, row1.id, "returns the object")

      console.log("\nSecond visit")
      const before = (await tx.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY } })).updatedAt.getTime()
      await ensureReferralCallObject(admin.id, tx)
      const after = (await tx.customObjectDef.findUnique({ where: { key: RC_OBJECT_KEY } })).updatedAt.getTime()
      eq(after, before, "writes nothing")

      console.log("\nAn admin edited it")
      const edited = (row1.properties as any[])
        .filter((p) => p.id !== "room")
        .map((p) => (p.id === "callback" ? { ...p, name: "Call-back number" } : p))
        .map((p) => (p.id === "status" ? { ...p, options: p.options.filter((o: string) => o !== "transferred"), locked: false } : p))
        .concat([{ id: "p_admin", name: "Attending", type: "TEXT" }])
      await tx.customObjectDef.update({ where: { id: row1.id }, data: { properties: edited } })
      const d3 = await ensureReferralCallObject(admin.id, tx)
      const ids = d3.properties.map((p) => p.id)
      eq(ids.includes("room"), true, "a deleted spec property is put back")
      eq(d3.properties.find((p) => p.id === "callback")?.name, "Call-back number", "a rename is kept")
      eq(d3.properties.find((p) => p.id === "status")?.options?.includes("transferred"), true, "a removed option value is put back")
      eq(d3.properties.find((p) => p.id === "status")?.locked, true, "a lost lock is restored")
      eq(d3.properties.find((p) => p.id === "p_admin")?.name, "Attending", "an admin-added property is untouched")

      console.log("\nThe awaiting-surgeon count")
      for (const [n, status] of [[1, "sent_to_surgeon"], [2, "accepted"], [3, "sent_to_surgeon"]] as const) {
        await tx.customObjectRecord.create({
          data: { objectDefId: row1.id, recordNumber: 900000 + n, values: { status, call_title: "Synthetic" }, ownerId: admin.id, createdById: admin.id },
        })
      }
      const awaiting = await tx.customObjectRecord.count({
        where: { objectDefId: row1.id, values: { path: ["status"], equals: "sent_to_surgeon" } },
      })
      eq(awaiting, 2, "counts only calls awaiting the surgeon")

      console.log("\nSomeone else's object with our key")
      await tx.customObjectDef.update({
        where: { id: row1.id },
        data: { properties: [{ id: "status", name: "Status", type: "DROPDOWN", options: ["open"] }] },
      })
      let refused = ""
      try { await ensureReferralCallObject(admin.id, tx) } catch (e) { refused = e instanceof Error ? e.message : String(e) }
      eq(refused.includes("wasn't created by the On-call intake"), true, "refused, with a message an admin can act on")

      throw new Rollback()
    }, { timeout: 60_000, maxWait: 15_000 })
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }

  console.log("\nOne field at a time (call log table, detail page)")
  const actor = { name: "Maria Alvarez", email: "ma@example.test" }
  const stored = { reason: "L hip fx", referred_from: "Northshore ER", charted: false, status: "sent_to_surgeon" }
  const ticked = await deriveReferralCallEdit({ stored, next: { ...stored, charted: true }, editedField: "charted", ownerId: null, actor })
  eq([ticked.charted_by, typeof ticked.charted_at], ["MA", "string"], "ticking Charted records who and when")
  eq(ticked.call_title, "Northshore ER – L hip fx", "the title follows the fields")
  const handText = await deriveReferralCallEdit({ stored: ticked, next: { ...ticked, surgeon_text: "typed by hand", reason: "R hip fx" }, editedField: "surgeon_text", ownerId: null, actor })
  eq([handText.surgeon_text, handText.surgeon_text_edited], ["typed by hand", true], "a text edited on the detail page stays as typed")
  const later = await deriveReferralCallEdit({ stored: handText, next: { ...handText, reason: "R wrist fx" }, editedField: "reason", ownerId: null, actor })
  eq(later.surgeon_text, "typed by hand", "…and isn't rebuilt by later field edits")
  eq(typeof later.epic_note === "string" && (later.epic_note as string).includes("R wrist fx"), true, "the Epic note still rebuilds")
  eq(RC_SERVER_SET_PROPS.has("charted_by") && RC_SERVER_SET_PROPS.has("call_title"), true, "server-set fields refuse direct edits")

  const leftover = await getReferralCallDef()
  eq(!!leftover, !!already, "rolled back — the database is as it was")
  console.log(failures === 0 ? "\nPASSED\n" : `\n${failures} FAILED\n`)
  await prisma.$disconnect()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
