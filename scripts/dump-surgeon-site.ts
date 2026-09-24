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

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

import { get } from "@vercel/blob"
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

  // The media too, beside the JSON. The site repo's build downloads every
  // photograph and rehab protocol PDF into its bundle, so a fixture without the
  // files can only exercise half of it — and the half it skips is the one that
  // decides whether a patient's post-operative instructions resolve.
  const mediaDir = join(dirname(out), ".crm-media")
  // An exec loop rather than matchAll: this repo's tsconfig target predates
  // iterating a RegExp iterator, and `npm run build` type-checks scripts/.
  const seen = new Set<string>()
  const ids: string[] = []
  const re = /\/api\/media\/([A-Za-z0-9]+)/g
  const haystack = JSON.stringify(site.publishedContent)
  let m: RegExpExecArray | null
  while ((m = re.exec(haystack)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1])
      ids.push(m[1])
    }
  }
  if (ids.length) {
    mkdirSync(mediaDir, { recursive: true })
    const manifest: Record<string, { name: string; contentType: string }> = {}
    for (const id of ids) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id } })
      if (!asset) {
        console.warn(`  ${id} has no MediaAsset — skipping`)
        continue
      }
      const blob = await get(asset.blobUrl, { access: "private" }).catch(() => null)
      if (!blob?.stream) {
        console.warn(`  ${id} (${asset.name}) has no blob — skipping`)
        continue
      }
      const bytes = Buffer.from(await new Response(blob.stream as any).arrayBuffer())
      writeFileSync(join(mediaDir, id), bytes)
      manifest[id] = { name: asset.name, contentType: asset.contentType }
    }
    writeFileSync(join(mediaDir, "manifest.json"), JSON.stringify(manifest, null, 2))
    console.log(`Wrote ${Object.keys(manifest).length} media file(s) to ${mediaDir}`)
  }

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
