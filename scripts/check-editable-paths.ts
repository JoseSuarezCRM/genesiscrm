/**
 * The preview frame's write surface, asserted.
 *
 * The frame runs on a public marketing site and can post any path it likes.
 * `lib/surgeon-site-address.ts` is the only thing between that and a write, so
 * its boundary is checked here rather than reasoned about.
 *
 *   npx tsx scripts/check-editable-paths.ts
 */

import { readFileSync } from "node:fs"
import { isEditablePath, isImagePath, safePagePath, setAtPath } from "../lib/surgeon-site-address"
import { emptyContent } from "../lib/surgeon-site"

/**
 * `--from <file>`: judge the paths the site actually emits.
 *
 * The site repo's `scripts/editable-paths.ts` renders every page in edit mode
 * and writes down every field it tagged. If one of those is not on the
 * allow-list below, clicking it does nothing — no error, no message, just an
 * editor that seems broken on that paragraph. This is the check that makes the
 * two repositories agree, without either importing the other.
 */
const fromIdx = process.argv.indexOf("--from")
if (fromIdx >= 0) {
  const file = process.argv[fromIdx + 1]
  if (!file) {
    console.error("--from needs a file written by the site repo's scripts/editable-paths.ts")
    process.exit(2)
  }
  const entries: [string, string][] = JSON.parse(readFileSync(file, "utf8"))
  if (entries.length === 0) {
    // An empty list passes every allow-list trivially, which is exactly the kind
    // of green result that has turned out to be measuring nothing before.
    console.error("The file lists no fields. Refusing to call that a pass.")
    process.exit(2)
  }
  const rejected = entries.filter(([raw]) => !isEditablePath(JSON.parse(raw)))
  console.log(`${entries.length} fields the site offers; ${entries.length - rejected.length} accepted here.`)
  for (const [raw, page] of rejected) console.error(`  NOT ALLOWED  ${raw}   (on ${page})`)
  if (rejected.length) {
    console.error("\nEach of those is clickable on the site and silently ignored here.")
    console.error("Add it to RULES in lib/surgeon-site-address.ts, or stop tagging it.")
  }
  process.exit(rejected.length ? 1 : 0)
}

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

console.log("\nShared photographs")
ok(isEditablePath(["pageImages", "expertise-shoulder"]), "allows a known shared-image slot")
ok(isImagePath(["pageImages", "expertise-shoulder"]), "marks it as image-valued")
ok(!isEditablePath(["pageImages", "not-an-image"]), "refuses an unknown slot")
ok(!isEditablePath(["pageImages", "/about"]), "refuses a per-page slot named by the frame")
ok(safePagePath("/expertise/shoulder/rotator-cuff-repair") !== null, "accepts a real route as a page key")
ok(safePagePath("/a/../b") === null && safePagePath("/x?y=1") === null, "refuses traversal and queries")

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
