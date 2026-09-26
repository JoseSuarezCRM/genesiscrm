/**
 * Load a surgeon's full record into their CRM site, from JSON exported by the
 * site repo (`scripts/export-surgeon.ts` there).
 *
 * Why this exists: the real content — clinics, credentials, 16 article
 * biographies, 100 publications, patient reviews, rehab protocols — accumulated
 * in the site repo before the CRM could hold it. Re-typing that by hand would
 * take days and would introduce errors in exactly the content that has to be
 * accurate, so it moves mechanically, once.
 *
 *   npx tsx scripts/import-surgeon-record.ts <slug> <path-to-json> [--publish]
 *   npx tsx scripts/import-surgeon-record.ts <slug> <json> --only=researchThemes,pageCopy
 *
 * Writes the draft by default, and shows what it would overwrite first. Pass
 * --publish to make it live in the same step.
 *
 * WITHOUT --only this replaces the whole content blob, which is right for the
 * first load of a record and wrong afterwards: the export carries bundle asset
 * paths for the photographs and knows nothing about preview hosts, so a plain
 * re-import would undo both. `--only` merges just the named fields and leaves
 * everything else exactly as it is — that is the flag to use once a site is
 * live.
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
import { missingCredentials, parseContent, type SurgeonSiteContent } from "../lib/surgeon-site"

function count(v: unknown): number {
  if (Array.isArray(v)) return v.length
  if (v && typeof v === "object") return Object.keys(v).length
  return v ? 1 : 0
}

const FIELDS: (keyof SurgeonSiteContent)[] = [
  "clinics", "credentials", "medicalLegalCredentials", "alumniOf", "reviews",
  "protocolGroups", "publications", "researchStats", "articleBios", "pageCopy", "pageLists",
]

async function main() {
  const [slug, jsonPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
  const publish = process.argv.includes("--publish")
  const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length)
  const only = onlyArg
    ? (onlyArg.split(",").map((f) => f.trim()).filter(Boolean) as (keyof SurgeonSiteContent)[])
    : null
  if (!slug || !jsonPath) {
    console.error("usage: import-surgeon-record.ts <slug> <path-to-json> [--publish]")
    process.exit(1)
  }

  const site = await (prisma as any).surgeonSite.findUnique({ where: { slug } })
  if (!site) {
    console.error(`No surgeon site with slug "${slug}".`)
    process.exit(1)
  }

  const parsed = parseContent(JSON.parse(fs.readFileSync(path.resolve(jsonPath), "utf8")))
  const existing = parseContent(site.content)

  if (only) {
    const valid = Object.keys(existing) as (keyof SurgeonSiteContent)[]
    const unknown = only.filter((f) => !valid.includes(f))
    if (unknown.length) {
      console.error(`Not fields on the contract: ${unknown.join(", ")}`)
      process.exit(1)
    }
  }

  // With --only, start from what is stored and overlay just the named fields.
  const incoming: SurgeonSiteContent = only
    ? { ...existing, ...Object.fromEntries(only.map((f) => [f, parsed[f]])) }
    : parsed

  console.log(`\n${site.name} (${slug}) — ${site.status}\n`)
  console.log("  field                      current  ->  incoming")
  let shrinks = 0
  for (const f of only ?? FIELDS) {
    const before = count(existing[f])
    const after = count(incoming[f])
    if (before === 0 && after === 0) continue
    const flag = after < before ? "  <-- LOSES CONTENT" : ""
    if (after < before) shrinks++
    console.log(`  ${String(f).padEnd(26)} ${String(before).padStart(5)}  ->  ${String(after).padEnd(5)}${flag}`)
  }
  console.log(`  ${"profile.bio".padEnd(26)} ${String(existing.profile.bio.length).padStart(5)}  ->  ${incoming.profile.bio.length}`)

  if (shrinks > 0) {
    // Refusing rather than warning: this script exists to *add* the real content,
    // so any field getting smaller means the export is wrong or the wrong file
    // was passed, and overwriting good content with less of it is not recoverable
    // from here.
    console.error(`\nRefusing: ${shrinks} field(s) would lose content. Check the export before re-running.`)
    process.exit(1)
  }

  const missing = missingCredentials(incoming, site.domain)
  if (missing.length > 0) {
    console.log(`\n  Still incomplete after import: ${missing.join("; ")}`)
  }

  await (prisma as any).surgeonSite.update({
    where: { id: site.id },
    data: {
      content: incoming,
      ...(publish && missing.length === 0
        ? { publishedContent: incoming, publishedAt: new Date(), status: "PUBLISHED" }
        : {}),
    },
  })

  console.log(`\nDraft updated.${publish && missing.length === 0 ? " Published." : publish ? " NOT published — see above." : ""}`)
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
