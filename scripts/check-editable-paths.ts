/**
 * The preview frame's write surface, asserted.
 *
 * The frame runs on a public marketing site and can post any path it likes.
 * `lib/surgeon-site-address.ts` is the only thing between that and a write, so
 * its boundary is checked here rather than reasoned about.
 *
 *   npx tsx scripts/check-editable-paths.ts
 */

import { isEditablePath, isImagePath, setAtPath } from "../lib/surgeon-site-address"
import { emptyContent } from "../lib/surgeon-site"

let failures = 0
const ok = (cond: boolean, what: string) => {
  if (!cond) { failures++; console.error("  FAIL  " + what) }
  else console.log("  ok    " + what)
}

console.log("\nRouting and identity must be unreachable")
for (const f of ["domain", "baseUrl", "previewDomains", "slug", "status", "redirectUrl", "searchConsoleToken"]) {
  ok(!isEditablePath([f]), `refuses ["${f}"]`)
}

console.log("\nPrototype pollution")
for (const p of [["__proto__"], ["profile", "__proto__"], ["constructor"], ["profile", "prototype", "x"]]) {
  ok(!isEditablePath(p), `refuses ${JSON.stringify(p)}`)
}

console.log("\nMalformed input")
ok(!isEditablePath([]), "refuses an empty path")
ok(!isEditablePath("pageCopy"), "refuses a bare string")
ok(!isEditablePath(null), "refuses null")
ok(!isEditablePath([{ a: 1 }]), "refuses an object segment")
ok(!isEditablePath(["profile", "bio", -1]), "refuses a negative index")
ok(!isEditablePath(["profile", "bio", 1.5]), "refuses a fractional index")
ok(!isEditablePath(["pageCopy", "not.a.real.key"]), "refuses an unknown pageCopy key")
ok(!isEditablePath(["articleBios", "no-such-article"]), "refuses an unknown article key")

console.log("\nReal fields are reachable")
ok(isEditablePath(["pageCopy", "home.intro"]), "allows a known pageCopy key")
ok(isEditablePath(["articleBios", "rotator-cuff-repair"]), "allows a known article key")
ok(isEditablePath(["profile", "bio", 2]), "allows profile.bio[2]")
ok(isEditablePath(["profile", "cards", 0, "description"]), "allows a profile card field")
ok(isEditablePath(["clinics", 1, "lead"]), "allows a clinic lead")
ok(isEditablePath(["clinics", 1, "es", "lead"]), "allows Spanish clinic copy")
ok(isEditablePath(["shortName"]), "allows shortName")

console.log("\nImages are addressable but not settable by the frame")
ok(isEditablePath(["headshot"]), "allows the headshot path")
ok(isImagePath(["headshot"]), "marks the headshot as image-valued")
ok(!isImagePath(["pageCopy", "home.intro"]), "does not mark copy as image-valued")

console.log("\nsetAtPath never creates, only changes")
const c = emptyContent()
c.profile.bio = ["one", "two"]
ok(setAtPath(c, ["profile", "bio", 1], "TWO").profile.bio[1] === "TWO", "sets an existing index")
ok(setAtPath(c, ["profile", "bio", 5], "x").profile.bio.length === 2, "refuses to extend an array")
ok(setAtPath(c, ["nope", "nope"], "x") === c, "returns the original for an unknown key")

console.log("\nsetAtPath does not mutate its input")
const before = JSON.stringify(c)
setAtPath(c, ["profile", "bio", 0], "changed")
ok(JSON.stringify(c) === before, "left the original untouched")

const patched = setAtPath(c, ["profile", "bio", 0], "changed")
ok(patched.clinics === c.clinics, "shared the branches it did not touch")

console.log(failures === 0 ? "\nPASSED\n" : `\n${failures} FAILED\n`)
process.exit(failures === 0 ? 0 : 1)
