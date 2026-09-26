/**
 * Load the practice's shared data into the CRM, from JSON exported by the site
 * repo (`scripts/export-practice.ts` there).
 *
 *   npx tsx scripts/import-practice.ts <path-to-json>
 *
 * Shows what it would overwrite first and refuses if any list would shrink —
 * this script exists to bring the real content IN, so a field getting smaller
 * means the export is wrong or the wrong file was passed, and that is not
 * recoverable from here.
 */

import fs from "fs"
import path from "path"

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

import { prisma } from "../lib/prisma"
import { parsePractice, practiceGaps, type PracticeContent } from "../lib/practice"

const count = (v: unknown) => (Array.isArray(v) ? v.length : v ? 1 : 0)

async function main() {
  const jsonPath = process.argv[2]
  if (!jsonPath) {
    console.error("usage: import-practice.ts <path-to-json>")
    process.exit(1)
  }

  const incoming = parsePractice(JSON.parse(fs.readFileSync(path.resolve(jsonPath), "utf8")))
  const row = await (prisma as any).practice.findUnique({ where: { id: "default" } })
  const existing = parsePractice(row?.content)

  const fields: (keyof PracticeContent)[] = [
    "offices", "hours", "insuranceCategories", "networkAffiliations",
  ]
  console.log(`\n${incoming.name || "(unnamed practice)"}\n`)
  console.log("  field                      current  ->  incoming")
  let shrinks = 0
  for (const f of fields) {
    const before = count(existing[f])
    const after = count(incoming[f])
    const flag = after < before ? "  <-- LOSES CONTENT" : ""
    if (after < before) shrinks++
    console.log(`  ${String(f).padEnd(26)} ${String(before).padStart(5)}  ->  ${String(after).padEnd(5)}${flag}`)
  }
  const plans = incoming.insuranceCategories.reduce((n, c) => n + c.plans.length, 0)
  console.log(`  ${"(insurance plans)".padEnd(26)}        ->  ${plans}`)

  if (shrinks > 0) {
    console.error(`\nRefusing: ${shrinks} field(s) would lose content. Check the export before re-running.`)
    process.exit(1)
  }

  await (prisma as any).practice.upsert({
    where: { id: "default" },
    create: { id: "default", content: incoming as any },
    update: { content: incoming as any },
  })

  const gaps = practiceGaps(incoming)
  console.log(gaps.length ? `\n  Still missing: ${gaps.join("; ")}` : "\n  Complete.")
  console.log("\nPractice saved.")
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
