/**
 * Checks for the referral-call modules that are NOT ports of the original tool
 * (those are covered by referral-calls-parity.ts): dates of birth, initials,
 * the chips, the merge rule, the derived values, and the form ↔ record mapping.
 *
 *   npx tsx scripts/check-referral-calls.ts
 *
 * All data is synthetic.
 */

import { parseDob, formatDob, dobToIso, isoToDob } from "../lib/referral-calls/dob"
import { initialsFor } from "../lib/referral-calls/initials"
import { applyThinnerPick, toggleSocialPick, toggleOutcome, isPickOn } from "../lib/referral-calls/picks"
import { resolveFields, sourceKey, type AiReading } from "../lib/referral-calls/merge"
import { deriveReferralCallValues } from "../lib/referral-calls/derive"
import { fieldsToValues, valuesToFields, computeCallTitle, RC_PROPERTIES } from "../lib/referral-calls/schema"
import { emptyFields } from "../lib/referral-calls/types"
import { enforcePropertyLocks } from "../lib/custom-object-locks"
import { parseReferral } from "../lib/referral-calls/parse"
import { buildExtractionPlan, BUILTIN_AI_FIELDS } from "../lib/referral-calls/ai-prompt"
import { normalizeAnswer, normalizeThinner, normalizePhone } from "../lib/referral-calls/ai-normalize"
import { snapshotToValues, valuesToSnapshot, emptySnapshot, mergeFormChanges, changedKeys } from "../lib/referral-calls/snapshot"
import { textExtrasFor, coerceExtraValue } from "../lib/referral-calls/extras"

let failures = 0
const eq = (got: unknown, want: unknown, what: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { failures++; console.error(`  FAIL  ${what}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`) }
  else console.log(`  ok    ${what}`)
}

const NOW = new Date(Date.UTC(2026, 8, 29, 18))

console.log("\nDates of birth")
eq(parseDob("1/2/45", NOW), { y: 1945, m: 1, d: 2 }, "two-digit year resolves to the past")
eq(parseDob("1/2/02", NOW), { y: 2002, m: 1, d: 2 }, "…including this century")
eq(parseDob("12/31/1938", NOW), { y: 1938, m: 12, d: 31 }, "four-digit year")
eq(parseDob("3-4-52", NOW), { y: 1952, m: 3, d: 4 }, "dashes")
eq(parseDob("4.5.60", NOW), { y: 1960, m: 4, d: 5 }, "dots")
eq(parseDob("1945-01-02", NOW), { y: 1945, m: 1, d: 2 }, "ISO")
eq(parseDob("02/31/1950", NOW), null, "February 31st is refused, not rolled over")
eq(parseDob("13/01/1950", NOW), null, "month 13 refused")
eq(parseDob("1/1/2099", NOW), null, "a future date refused")
eq(parseDob("84 yo", NOW), null, "an age is not a date")
eq(formatDob({ y: 1945, m: 1, d: 2 }), "01/02/1945", "formats MM/DD/YYYY")
eq(dobToIso("1/2/45", NOW), "1945-01-02T12:00:00.000Z", "stored at noon UTC")
eq(isoToDob("1945-01-02T12:00:00.000Z"), "01/02/1945", "reads back without timezone drift")
eq(isoToDob("1945-01-02T00:00:00.000Z"), "01/02/1945", "…even from a midnight value")
eq(isoToDob(null), "", "missing reads as empty")

console.log("\nInitials")
eq(initialsFor({ name: "Jane Smith" }), "JS", "first last")
eq(initialsFor({ name: "Smith, Jane" }), "JS", "last, first")
eq(initialsFor({ name: "Jane Smith, PA-C" }), "JS", "credential after a comma")
eq(initialsFor({ name: "Dr. Jane Q. Smith Jr." }), "JS", "titles and suffixes dropped")
eq(initialsFor({ name: "Jane Smith MD" }), "JS", "trailing credential")
eq(initialsFor({ name: "", email: "jane.doe@example.test" }), "JD", "email with a separator")
eq(initialsFor({ name: null, email: "jsuarez@example.test" }), "JS", "plain email local part")
eq(initialsFor({}), "___", "nothing to go on")

console.log("\nChips")
eq(applyThinnerPick("", "Eliquis"), { value: "Eliquis", clearLastDose: false }, "pick a thinner")
eq(applyThinnerPick("Eliquis", "Eliquis"), { value: "", clearLastDose: false }, "tap again to clear")
eq(applyThinnerPick("Eliquis", "None"), { value: "None", clearLastDose: true }, "None clears the last dose")
eq(toggleSocialPick("Own historian", "Limited historian"), "Limited historian", "one historian line")
eq(toggleSocialPick("Lives alone\nUses walker", "Lives with family"), "Uses walker\nLives with family", "one living situation")
eq(toggleSocialPick("Uses walker", "Uses walker"), "", "toggle off")
eq(toggleOutcome("WBAT, Splint", "NWB"), "Splint, NWB", "WBAT and NWB exclude each other, canonical order kept")
eq(toggleOutcome("", "Abx"), "Abx", "add")
eq(isPickOn("Eliquis, Aspirin", "aspirin"), true, "comma list, any case")

console.log("\nMerge: a touched field is never overwritten")
const text = "Northshore ER call - room 12\nReason: L hip fx"
const rules = parseReferral(text)
const aiValues = { ...rules, reason: "L intertrochanteric hip fracture", hpi: "Fell at home" }
const ai: AiReading = { sourceKey: sourceKey(text, null), values: aiValues, rulesAtRequest: rules }
const key = sourceKey(text, null)
eq(resolveFields(rules, ai, {}, key).reason, "L intertrochanteric hip fracture", "AI refines the parser")
eq(resolveFields(rules, ai, { reason: "typed by hand" }, key).reason, "typed by hand", "manual beats AI")
eq(resolveFields(rules, null, {}, key).reason, "L hip fx", "parser alone when no AI yet")
const text2 = text + "\nRoom: 14"
const rules2 = parseReferral(text2)
const key2 = sourceKey(text2, null)
eq(resolveFields(rules2, ai, {}, key2).room, "14", "a field the new text changed follows the parser")
eq(resolveFields(rules2, ai, {}, key2).hpi, "Fell at home", "…while untouched AI fields survive the edit")

console.log("\nForm ↔ record")
const f = { ...emptyFields(), first: "Jane", last: "Doe", dob: "1/2/45", outcome: "WBAT, Abx", dm: "POA" as const, urgent: true, referredFrom: "Northshore ER", reason: "L hip fx" }
const v = fieldsToValues(f)
eq(v.dob, dobToIso("1/2/45"), "DOB stored as ISO noon")
eq(v.outcome, ["wbat", "abx"], "outcome stored as option values")
eq(v.decision_maker, "poa", "decision maker stored as a value")
eq(valuesToFields(v as Record<string, unknown>).outcome, "WBAT, Abx", "outcome reads back as labels")
eq(valuesToFields(v as Record<string, unknown>).dob, "01/02/1945", "DOB reads back as MM/DD/YYYY")
eq(valuesToFields(v as Record<string, unknown>).dm, "POA", "decision maker reads back")
eq(fieldsToValues({ ...emptyFields(), dob: "02/31/1950" }).dob, null, "an invalid DOB is not stored")
eq(computeCallTitle({ referredFrom: "", reason: "" }), "Referral call", "a call with nothing still has a title")
eq(computeCallTitle({ referredFrom: "St. Mary ER", reason: "L hip fx" }), "St. Mary ER – L hip fx", "site – reason")
eq(RC_PROPERTIES.every((p) => p.locked === true && p.internalName === p.id), true, "every spec property locked, internalName = id")
eq(RC_PROPERTIES.filter((p) => p.type === "PHONE").length, 0, "no PHONE properties (they pull in SMS threads)")
eq(RC_PROPERTIES.filter((p) => p.primary).map((p) => p.id), ["call_title"], "exactly one primary: the derived title")

console.log("\nDerived values")
const ctx = { actorInitials: "MA", ownerInitials: "JS", now: NOW }
const d1 = deriveReferralCallValues({}, { ...v, charted: true }, ctx)
eq(d1.call_title, "Northshore ER – L hip fx", "title derived")
eq(d1.status, "sent_to_surgeon", "status defaults")
eq(d1.charted_by, "MA", "charted by = whoever ticked it")
eq(typeof d1.surgeon_text === "string" && (d1.surgeon_text as string).startsWith("URGENT\nNorthshore ER call"), true, "surgeon text built from the fields")
eq((d1.epic_note as string).startsWith("JS is the on-call provider this week."), true, "Epic note uses the call-taker's initials")
const d2 = deriveReferralCallValues(d1, { ...d1, charted: true }, { ...ctx, actorInitials: "ZZ" })
eq(d2.charted_by, "MA", "re-saving keeps the original charter")
const d3 = deriveReferralCallValues(d2, { ...d2, charted: false }, ctx)
eq([d3.charted_by, d3.charted_at], ["", null], "unticking clears charted by/at")
const d4 = deriveReferralCallValues(d1, { ...d1, surgeon_text: "hand written", surgeon_text_edited: true, reason: "changed" }, ctx)
eq(d4.surgeon_text, "hand written", "a hand-edited text is not rebuilt")


console.log("\nProperty locks")
const locked = RC_PROPERTIES.find((p) => p.id === "status")!
const free = { id: "extra", name: "Insurance", type: "TEXT" as const }
const stored = [locked, free]
eq("error" in enforcePropertyLocks(stored, [free]) ? "error" : (enforcePropertyLocks(stored, [free]) as { properties: { id: string }[] }).properties.map((p) => p.id), ["extra", "status"], "a deleted locked property is put back")
eq("error" in enforcePropertyLocks(stored, [{ ...locked, type: "TEXT" }, free]), true, "retyping a locked property is refused")
eq("error" in enforcePropertyLocks(stored, [{ ...locked, options: ["accepted"] }, free]), true, "removing an option value is refused")
const renamed = enforcePropertyLocks(stored, [{ ...locked, name: "Call status", optionLabels: { ...locked.optionLabels, accepted: "Taken" } }, free])
eq("properties" in renamed && renamed.properties[0]!.name, "Call status", "renaming is allowed")
const added = enforcePropertyLocks(stored, [{ ...locked, options: [...(locked.options ?? []), "pending"] }, free])
eq("properties" in added, true, "adding an option is allowed")
const unlocked = enforcePropertyLocks(stored, [{ ...locked, locked: false }, free])
eq("properties" in unlocked && unlocked.properties[0]!.locked, true, "the client cannot unlock by clearing the flag")
eq("properties" in enforcePropertyLocks(stored, [locked]), true, "deleting an unlocked property is allowed")

console.log("\nAI plan: nothing an admin writes reaches the schema")
const addedProps: import("../app/actions/custom-objects").CustomObjectProperty[] = [
  { id: "p_att", name: "Zyxwv Attending", type: "TEXT" },
  { id: "p_ins", name: "Insurance tier", type: "DROPDOWN" as const, options: ["opt_a", "opt_b"], optionLabels: { opt_a: "Alpha Label", opt_b: "Beta Label" } },
  { id: "p_tags", name: "Tags", type: "MULTI_SELECT" as const, options: ["t1", "t2"], optionLabels: { t1: "Tag One", t2: "Tag Two" } },
  { id: "p_amt", name: "Copay", type: "NUMBER" },
  { id: "p_when", name: "Surgery date", type: "DATE" },
  { id: "p_owner", name: "Reviewer", type: "USER" },
  { id: "p_off", name: "Not for AI", type: "TEXT" },
]
const props = [...RC_PROPERTIES, ...addedProps]
const profile = {
  instructions: "Always Qwertyson-check the room.",
  fields: {
    p_att: { extract: true, instruction: "Pull the attending Qwertyson named." },
    p_ins: { extract: true }, p_tags: { extract: true }, p_amt: { extract: true }, p_when: { extract: true },
    p_owner: { extract: true },
    hpi: { extract: false },
    reason: { instruction: "Custom reason rule Vbnm." },
  },
}
const plan = buildExtractionPlan(props, profile)
const schemaText = JSON.stringify(plan.schema)
eq(["Zyxwv", "Qwertyson", "Alpha", "opt_a", "Attending", "Insurance", "Vbnm", "Tag One", "t1", "Copay", "p_att"].filter((w) => schemaText.includes(w)), [], "no label, option, id or instruction in the schema")
eq(["Zyxwv Attending", "Qwertyson", "Alpha Label", "Vbnm", "Tag One"].filter((w) => !plan.system.includes(w)), [], "…all of them are in the prompt instead")
eq(plan.extras.map((x) => x.code), ["extra_1", "extra_2", "extra_3", "extra_4", "extra_5"], "USER fields and fields without a rule aren't AI-filled")
const sp = (plan.schema as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean })
eq("hpi" in sp.properties, false, "a built-in turned off leaves the schema")
eq(sp.required.length === Object.keys(sp.properties).length && sp.additionalProperties === false, true, "every field required, no extras allowed")
eq(schemaText.includes("anyOf") || schemaText.includes("oneOf") || schemaText.includes("\"null\""), false, "no unions or nullables")
eq(plan.system.includes("Custom reason rule Vbnm.") && !plan.system.includes(BUILTIN_AI_FIELDS.find((b) => b.field === "reason")!.defaultInstruction), true, "a custom rule replaces the default")
const plan2 = buildExtractionPlan(props, { ...profile, fields: { ...profile.fields, p_att: { extract: true, instruction: "Something else entirely" } } })
eq(JSON.stringify(plan2.schema), schemaText, "editing an instruction doesn't change the schema")

console.log("\nAI answers → form values")
const answer: Record<string, unknown> = {}
for (const b of plan.builtins) answer[b.schemaKey] = b.kind === "boolean" ? false : b.kind === "outcome" ? [] : ""
Object.assign(answer, {
  patientFirstName: "JANE", patientLastName: "MCDONALD", dateOfBirth: "1/2/45", callbackNumber: "(555) 123-4567",
  bloodThinner: "apixaban", bloodThinnerLastDose: "last night", decisionMaker: "poa", outcome: ["nwb", "wbat", "splint"],
  abxDetail: "Ancef 2g", referredFrom: "northshore er", urgent: true,
  extra_1: "Dr. Who", extra_2: "2", extra_3: ["2", "1", "2"], extra_4: "$1,200", extra_5: "10/15/2026",
})
const n = normalizeAnswer(plan, answer, NOW)!
eq([n.fields.first, n.fields.last], ["Jane", "McDonald"], "capitals title-cased like the parser")
eq(n.fields.dob, "01/02/1945", "DOB normalised")
eq(n.fields.callback, "555-123-4567", "phone formatted")
eq(n.fields.anticoag, "Eliquis", "generic → brand")
eq(n.fields.dm, "POA", "decision maker")
eq(n.fields.outcome, "Splint, Abx", "WBAT+NWB together means neither; abx detail implies Abx")
eq(n.fields.referredFrom, "northshore ER", "ER capitalised")
eq(n.fields.urgent, true, "urgent")
eq("hpi" in n.fields, false, "a field the AI wasn't asked for isn't returned")
eq(n.extras, { p_att: "Dr. Who", p_ins: "opt_b", p_tags: ["t2", "t1"], p_amt: 1200, p_when: "2026-10-15T12:00:00.000Z" }, "codes decoded back to option values")
eq(normalizeAnswer(plan, { ...answer, dateOfBirth: "84 yo" }, NOW)!.fields.dob, "", "an age is not a DOB")
eq(normalizeAnswer(plan, { ...answer, bloodThinner: "none", bloodThinnerLastDose: "yesterday" }, NOW)!.fields.lastDose, "", "no thinner, no last dose")
eq(normalizeAnswer(plan, { ...answer, surprise: "x" }, NOW), null, "an unexpected key is refused")
eq(normalizeAnswer(plan, { ...answer, urgent: "yes" }, NOW), null, "a wrong type is refused")
eq(normalizeAnswer(plan, { ...answer, extra_2: "9" }, NOW), null, "an unknown option code is refused")
eq(normalizeThinner("Eliquis and ASA"), "Eliquis, Aspirin", "two thinners")
eq(normalizeThinner("Yes, agent not specified"), "Yes, agent not specified", "unspecified kept")
eq(normalizePhone("555-123-4567 x22"), "555-123-4567 x22", "an extension is left as written")

console.log("\nSnapshots and added fields")
const snap = { ...emptySnapshot(), fields: { ...emptySnapshot().fields, reason: "L hip fx" }, extras: { p_att: "Dr. Who", status: "accepted", p_gone: "x" } }
const vals = snapshotToValues(snap, new Set(["p_att"]))
eq([vals.p_att, vals.status, "p_gone" in vals], ["Dr. Who", "sent_to_surgeon", false], "extras can't write built-ins or unknown ids")
eq(valuesToSnapshot(vals, new Set(["p_att"])).extras, { p_att: "Dr. Who" }, "round trip")
const tx = textExtrasFor(props, { p_att: { inSurgeonText: true }, p_ins: { inEpicNote: true, inSurgeonText: true }, p_amt: { inEpicNote: true } }, { p_att: "Dr. Who", p_ins: "opt_a", p_amt: null })
eq(tx, { surgeon: [{ label: "Zyxwv Attending", value: "Dr. Who" }, { label: "Insurance tier", value: "Alpha Label" }], note: [{ label: "Insurance tier", value: "Alpha Label" }] }, "text lines use labels; empty values skipped")
eq(coerceExtraValue(addedProps[1]!, "opt_c"), undefined, "an unknown dropdown value is refused")
eq(coerceExtraValue(addedProps[4]!, "2026-02-30"), undefined, "an impossible date is refused")
eq(coerceExtraValue(addedProps[4]!, "2026-02-03"), "2026-02-03T12:00:00.000Z", "a date is stored at noon UTC")
eq(coerceExtraValue(addedProps[3]!, "12"), 12, "a numeric string becomes a number")

console.log("\nTwo people, one call")
{
  const ids = new Set<string>()
  const loaded = { ...emptySnapshot(), fields: { ...emptySnapshot().fields, reason: "L hip fx", hpi: "fell" } }
  const stored0 = snapshotToValues(loaded, ids)
  // Tab B (the call log) ticks Charted and moves the status while tab A is open.
  const storedNow = { ...stored0, charted: true, charted_by: "MA", status: "accepted" }
  // Tab A only edited the HPI.
  const mine = snapshotToValues({ ...loaded, fields: { ...loaded.fields, hpi: "fell at home" } }, ids)
  const merged = mergeFormChanges(storedNow, stored0, mine)
  eq([merged.hpi, merged.charted, merged.charted_by, merged.status], ["fell at home", true, "MA", "accepted"], "saving tab A keeps tab B's changes")
  const both = mergeFormChanges(storedNow, stored0, { ...mine, status: "transferred" })
  eq(both.status, "transferred", "…but a field both changed takes the later save")
  eq(changedKeys(stored0, merged).sort(), ["charted", "charted_by", "hpi", "status"], "changed keys")
}

console.log(failures === 0 ? "\nPASSED\n" : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
