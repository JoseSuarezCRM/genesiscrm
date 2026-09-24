/**
 * Write a surgeon site's PUBLISHED content to a file, exactly as the public API
 * would return it.
 *
 *   npx tsx scripts/dump-surgeon-site.ts nolan-horner E:/Descargas/GOSM/horner-site/.crm-published.json
 *
 * The site repo needs a real payload to develop against before it has an API
 * token, and — more to the point — before anything of its rendering depends on
 * this CRM being reachable. Its comparison script maps this file into a
 * `Surgeon` and diffs it against the record bundled in that repo, which is how
 * the two are proven to agree without a network call in the loop.
 *
 * The selection is copied from app/api/public/surgeon-sites/route.ts on purpose:
 * a fixture that carries fields the API does not return would prove the wrong
 * thing. Published only — never the draft.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs"

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

import { prisma } from "../lib/prisma"

async function main() {
  const slug = process.argv[2]
  const out = process.argv[3]
  if (!slug || !out) {
    console.error("usage: dump-surgeon-site.ts <slug> <out.json>")
    process.exit(1)
  }

  const site = await (prisma as any).surgeonSite.findUnique({
    where: { slug },
    select: {
      slug: true,
      domain: true,
      status: true,
      redirectUrl: true,
      publishedContent: true,
      publishedAt: true,
    },
  })

  if (!site) {
    console.error(`No surgeon site with slug "${slug}".`)
    process.exit(1)
  }
  if (!site.publishedContent) {
    console.error(`"${slug}" has never been published — there is nothing the site app could read.`)
    process.exit(1)
  }

  writeFileSync(out, JSON.stringify({ site }, null, 2))
  const c = site.publishedContent as any
  console.log(`Wrote ${out}`)
  console.log(`  ${site.slug} · ${site.domain} · ${site.status} · published ${site.publishedAt?.toISOString() ?? "—"}`)
  console.log(
    `  ${c.clinics?.length ?? 0} clinics · ${c.reviews?.length ?? 0} reviews · ` +
      `${c.publications?.length ?? 0} publications · ${Object.keys(c.pageCopy ?? {}).length} pageCopy keys`,
  )
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
