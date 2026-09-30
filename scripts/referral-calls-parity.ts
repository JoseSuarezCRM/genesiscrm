/**
 * The referral-call parser and text builders, checked against the original.
 *
 *   npx tsx scripts/referral-calls-parity.ts
 *   npx tsx scripts/referral-calls-parity.ts --html <path to referral-intake_1.html>
 *
 * `lib/referral-calls/parse.ts` and `text.ts` claim to be verbatim ports of the
 * HTML tool staff already trust. This is what makes that a checked claim rather
 * than a hope: the vendored original runs in a sandbox next to the port, on
 * hand-written cases for every branch plus thousands of generated ones, and any
 * difference fails the run.
 *
 * `--html` re-extracts the original block from the HTML file and fails if the
 * vendored copy has drifted from it.
 *
 * Every input here is synthetic. No real patient data belongs in this file.
 */

import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import vm from "node:vm"
import { parseReferral } from "../lib/referral-calls/parse"
import { buildSurgeonText, buildTelNote } from "../lib/referral-calls/text"

const FIXTURE = "scripts/fixtures/referral-calls/original-parser.js"

type AnyFn = (...args: unknown[]) => unknown
const original = vm.runInNewContext(
  readFileSync(FIXTURE, "utf8") + ";({ parseReferral, buildSurgeonText, buildTelNote })",
  {},
) as { parseReferral: AnyFn; buildSurgeonText: AnyFn; buildTelNote: AnyFn }

// ── Optional: confirm the vendored copy still matches the HTML ─────────────────
const htmlAt = process.argv.indexOf("--html")
if (htmlAt >= 0) {
  const path = process.argv[htmlAt + 1]
  if (!path) { console.error("--html needs a path"); process.exit(2) }
  const raw = readFileSync(path)
  const html = raw.toString("utf8")
  const block = html.slice(html.indexOf("/*PARSER-START*/") + "/*PARSER-START*/".length, html.indexOf("/*PARSER-END*/"))
  const vendored = readFileSync(FIXTURE, "utf8")
  if (!vendored.endsWith(block)) {
    console.error(`The vendored parser differs from ${path} (md5 ${createHash("md5").update(raw).digest("hex")}).`)
    process.exit(1)
  }
  console.log("Vendored parser matches the HTML.")
}

// ── Hand-written cases: one per branch of the original ─────────────────────────
const CASES: string[] = [
  "",
  "   \n  \n",
  // Answering-service boilerplate that must be dropped.
  "Click to clear\nReply STOP to opt out\nMsg & data rates may apply\nhttps://example.test/x\n-----\n9/28",
  // The site/room line the original special-cases.
  "Northshore ER call - room 12\nPatient: DOE, JANE\nDOB: 01/02/1945\nCallback: (312) 555-0142\nL hip fx, on Eliquis\nNPO since 0600",
  "St. Testing ED call, rm # 4B",
  // Urgent words anywhere.
  "URGENT\nMercy Hospital\nRe: R distal radius fx",
  "stat consult needed - Testville ICU",
  // Key/value families, each spelling the original accepts.
  "Caller: RN Smithers\nPhone: 773.555.0100\nPatient name: Quincy Adams Doe\nRoom: 5 West 22\nMRN: 00012345\nCaller ID: 773-555-0199\nFacility: testville medical center er",
  "Pt phone: 1 (630) 555 0111\nCell: 630-555-0112\nHome phone: 630-555-0113\nCB: 630-555-0114",
  "called by: dr who\nrm: 3\nd/o/b: 3-4-52\nacct: 998877\nreferring facility: sample snf\nreason for referral: ankle fx",
  "dx: patella fracture\nhpi: fell from ladder 2d ago\npmh: HTN, DM2\nblood thinner: none",
  "anticoag: coumadin\nsocial: lives with daughter\nnotes: call back after 5\nFoo: bar value",
  "hx: afib\nsh: ambulates with cane\ncomments: family at bedside\nregarding: shoulder dislocation",
  // POA variants.
  "POA: daughter Maria 312-555-0150",
  "Has healthcare proxy - son Tom (312) 555-0151",
  "Own decision maker",
  "decision-maker: self",
  "guardian: court appointed, ph 312-555-0152",
  // Antibiotics and plan lines.
  "Abx: Ancef 2 g IV given 1400",
  "antibiotics - vanco",
  "Plan: WBAT, splint, outpatient f/u in clinic",
  "Dispo: NWB, planning for surgery",
  "outcome - clearance requested",
  "to OR tonight",
  // Labs and imaging prefixes.
  "Labs: INR 2.8, Hgb 11.2\nXR L hip: IT fx\nCT head neg\nMRI shows ACL tear\ninr 1.1\nHgb 9.8\nimaging: pending",
  "CT was given because of fall",
  // Meds.
  "Meds: metoprolol, metformin\nhome meds - lisinopril",
  // Long lines become HPI; short patterns too.
  "84 yo F with mechanical fall at home, unable to bear weight on the left leg, shortened and externally rotated",
  "s/p fall down stairs",
  "Pt is a 67 year old male",
  "72yo M",
  // Social.
  "Lives alone\nFrom SNF\nuses walker at baseline\nbedbound\nlimited historian",
  // History.
  "h/o PE on Eliquis\nhistory of DVT, taking warfarin\npast medical history: CKD",
  // Bare date and bare phone lines.
  "1/2/45",
  "DOB 12/31/1938",
  "born 4.5.60",
  "(847) 555-0123",
  "847-555-0124\n847-555-0125",
  // Blood thinner mentions without a name.
  "on a blood thinner",
  "anticoagulated, last dose last night",
  "Last dose: 2200 yesterday",
  // Drug names and generics, including repeats.
  "takes apixaban and ASA, also plavix; aspirin",
  "ENOXAPARIN 40 daily, heparin drip",
  // Unlabeled lines: the facility and reason fallbacks.
  "Some Rehab Center\nTwisted ankle playing soccer",
  "Caller: Nurse Jo\nAcme Orthopedic Associates\nwrist pain",
  "just a line\nanother line",
  // Names: LAST, FIRST / Mc / all caps / three parts.
  "Name: MCDONALD, RONALD",
  "Patient: van der BERG",
  "Pt: JOHN QUINCY PUBLIC",
  // Reason derived from the HPI when missing.
  "HPI: tripped and has a right distal radius fracture with deformity",
  "hpi: bilateral wrist fx after fall",
  "hpi: open tib fib fracture after mvc",
  // NPO variants.
  "NPO",
  "npo after midnight",
  "NPO x 6h",
  // CRLF line endings and odd spacing.
  "Room: 7\r\nDOB: 07/07/1977\r\n   Reason:   hip pain  \r\n",
  // Colon-in-value and equals.
  "Note = see chart; time: 14:30",
  "Callback=312-555-0177 ext 12",
]

// ── Generated cases: seeded, so a failure reproduces ───────────────────────────
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}
const r = rng(20260929)
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

const FIRST = ["JANE", "John", "maria", "Quinn", "O'NEIL", "Li", "MARY ANN"]
const LAST = ["DOE", "Smith", "mcgee", "Van Der Berg", "O'BRIEN", "Nguyen", "Garcia-Lopez"]
const SITES = ["Northshore ER", "Testville Hospital", "St. Example ED", "Acme ICU", "Sample SNF", "County Medical Center", "Mercy floor 4"]
const INJ = ["L hip fx", "R distal radius fracture", "ankle dislocation", "patella fx", "rotator cuff tear", "open tib fx", "hand laceration", "septic knee", "shoulder dislocation"]
const DRUGS = ["Eliquis", "apixaban", "xarelto", "Coumadin", "warfarin", "ASA", "aspirin 81", "Plavix", "lovenox", "heparin", "none", "no blood thinners"]
const LINES: (() => string)[] = [
  () => `${pick(SITES)} call - room ${Math.floor(r() * 40)}`,
  () => `${pick(SITES)} call`,
  () => `Patient: ${pick(LAST)}, ${pick(FIRST)}`,
  () => `Name: ${pick(FIRST)} ${pick(LAST)}`,
  () => `DOB: ${1 + Math.floor(r() * 12)}/${1 + Math.floor(r() * 28)}/${pick(["45", "1945", "1938", "02", "2001"])}`,
  () => `${1 + Math.floor(r() * 12)}-${1 + Math.floor(r() * 28)}-${pick(["60", "1960"])}`,
  () => `Callback: ${pick(["(312) 555-01", "312.555.01", "1-312-555-01", "312 555 01"])}${10 + Math.floor(r() * 89)}`,
  () => `Pt phone: 630-555-01${10 + Math.floor(r() * 89)}`,
  () => `Caller: ${pick(["RN Pat", "Dr. Test", "charge nurse", "PA Lee"])}`,
  () => `Room: ${pick(["12", "5W-22", "ED 4", "bed 3"])}`,
  () => `Reason: ${pick(INJ)}`,
  () => pick(INJ),
  () => `${40 + Math.floor(r() * 50)} yo ${pick(["M", "F"])} with ${pick(INJ)} after ${pick(["fall", "mvc", "sports injury", "assault"])}${r() < 0.5 ? ", neurovascularly intact distally, pain controlled" : ""}`,
  () => `on ${pick(DRUGS)}`,
  () => `Blood thinner: ${pick(DRUGS)}`,
  () => `Last dose: ${pick(["0600", "last night", "yesterday 2200", "unknown"])}`,
  () => `NPO ${pick(["", "since 0600", "after midnight", "x 4h"])}`,
  () => pick(["Lives alone", "lives with family", "from SNF", "Ambulatory at baseline", "uses walker", "own historian", "limited historian"]),
  () => pick(["POA: daughter", "Has POA - son Mike 312-555-0190", "own decision maker", "health care proxy: wife"]),
  () => pick(["Plan: WBAT", "Plan: NWB, splint", "outpatient f/u", "clearance pending", "planning for surgery"]),
  () => pick(["Abx: Ancef 2g", "antibiotics given", "abx - cefazolin 1400"]),
  () => pick(["Labs: INR 2.1", "XR: fx", "CT neg", "Hgb 10.2", "imaging: MRI pending"]),
  () => pick(["Meds: metoprolol", "home meds: metformin, lisinopril"]),
  () => pick(["h/o CAD", "hx of PE on eliquis", "PMH: HTN, HLD", "history of CKD"]),
  () => pick(["URGENT", "stat", "ASAP please", "emergent"]),
  () => pick(["Reply STOP to unsubscribe", "Click to clear", "https://ans.example/x", "----", "Msg & data rates may apply"]),
  () => pick(["MRN: 1234567", "Caller ID: 312-555-0100", "acct: 55", "Foo: bar"]),
  () => pick(["random words here", "see above", "thanks!", "Some Rehab Center", "Acme Ortho Group"]),
  () => pick(["", "   ", "\t"]),
]

const generated: string[] = []
for (let i = 0; i < 5000; i++) {
  const n = 1 + Math.floor(r() * 12)
  const lines: string[] = []
  for (let j = 0; j < n; j++) lines.push(pick(LINES)())
  generated.push(lines.join(r() < 0.1 ? "\r\n" : "\n"))
}

// ── Compare ────────────────────────────────────────────────────────────────────
const failures: string[] = []
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

let parsed = 0
for (const input of [...CASES, ...generated]) {
  const want = original.parseReferral(input)
  const got = parseReferral(input)
  parsed++
  if (!same(want, got) && failures.length < 10) {
    failures.push(`parseReferral(${JSON.stringify(input)})\n  original: ${JSON.stringify(want)}\n  port:     ${JSON.stringify(got)}`)
  }
}

// Builders: over every parsed case, with a few initials variants.
let built = 0
for (const input of [...CASES, ...generated]) {
  const fields = original.parseReferral(input) as Record<string, unknown>
  for (const prov of ["", "JS", "ABC"]) {
    // Exercise outcome/abx/other-notes combinations the parser rarely produces.
    const variant = { ...fields, prov, otherNotes: r() < 0.3 ? "Call back in AM\nNeeds MRI" : fields["otherNotes"] }
    const a1 = original.buildSurgeonText(variant), b1 = buildSurgeonText(variant as never)
    const a2 = original.buildTelNote(variant, 0), b2 = buildTelNote(variant as never)
    built += 2
    if (a1 !== b1 && failures.length < 10) failures.push(`buildSurgeonText\n  original: ${JSON.stringify(a1)}\n  port:     ${JSON.stringify(b1)}`)
    if (a2 !== b2 && failures.length < 10) failures.push(`buildTelNote\n  original: ${JSON.stringify(a2)}\n  port:     ${JSON.stringify(b2)}`)
  }
}

if (failures.length) {
  console.error(`\nPARITY FAILED — first ${failures.length} difference(s):\n`)
  for (const f of failures) console.error(f + "\n")
  process.exit(1)
}
console.log(`PARITY OK — ${parsed} parser inputs and ${built} builder outputs identical to the original.`)
