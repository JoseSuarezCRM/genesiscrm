/**
 * Put a surgeon's real photographs into the media library and onto their site.
 *
 *   npx tsx scripts/seed-surgeon-images.ts nolan-horner           # dry run
 *   npx tsx scripts/seed-surgeon-images.ts nolan-horner --apply
 *
 * Why this is needed: the surgeon record was imported into the CRM before the
 * site app's assets were rescued from Lovable's CDN, so the stored image paths
 * are still `/__l5e/assets-v1/…` — pointers into infrastructure this org does
 * not control and which answer 404. The moment the site starts reading its
 * content from here, every photograph on it would break.
 *
 * The replacements are the real files from the site repo, uploaded to the media
 * library so they get a stable public /api/media/<id> address. That address is
 * public by design: the site runs on separate infrastructure with no session
 * here, and an image behind auth cannot be rendered by a browser on another
 * domain.
 *
 * Both the draft and the published snapshot are updated. Updating only the draft
 * would leave the live site pointing at dead URLs until someone happened to
 * press Publish.
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

// Prisma reads .env by itself, but the Blob token lives in .env.local and
// nothing loads that for a plain `tsx` run — the upload fails with "No token
// found" well after the first file has been read.
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

import { put } from "@vercel/blob"
import { prisma } from "../lib/prisma"
import { mediaUrl } from "../lib/media-url"
import { parseContent, type SurgeonSiteContent } from "../lib/surgeon-site"

const SITE_REPO = process.env.SITE_REPO ?? "E:/Descargas/GOSM/horner-site"
const APPLY = process.argv.includes("--apply")

/** Which file fills which field. Field names match the shared contract. */
const IMAGES: { field: keyof SurgeonSiteContent; file: string; what: string }[] = [
  { field: "headshot", file: "nolan-headshot.webp", what: "main portrait" },
  { field: "headshotSecondary", file: "nolan-headshot2.webp", what: "About page hero" },
  { field: "portraitAtWork", file: "nolan-or.webp", what: "in the operating room" },
  { field: "schemaImagePath", file: "nolan-headshot-schema.png", what: "search-result image" },
]

const TYPES: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }

async function main() {
  const slug = process.argv[2]
  if (!slug) { console.error("usage: seed-surgeon-images.ts <slug> [--apply]"); process.exit(1) }

  const site = await (prisma as any).surgeonSite.findUnique({ where: { slug } })
  if (!site) { console.error(`No surgeon site with slug "${slug}".`); process.exit(1) }

  const draft = parseContent(site.content)
  const published = site.publishedContent ? parseContent(site.publishedContent) : null

  console.log(`${slug} — ${site.domain} (${site.status})\n`)
  const updates: Partial<Record<keyof SurgeonSiteContent, string>> = {}

  for (const { field, file, what } of IMAGES) {
    const path = join(SITE_REPO, "src/assets", file)
    const current = String((draft as any)[field] ?? "")
    const dead = current.startsWith("/__l5e/") || current === ""
    const state = current === "" ? "empty" : dead ? "DEAD Lovable CDN path" : "already a real url"

    if (!existsSync(path)) {
      console.log(`  ${field.padEnd(18)} ${state} — but ${file} is not in the site repo, skipping`)
      continue
    }
    if (!dead) {
      console.log(`  ${field.padEnd(18)} ${state}, leaving alone`)
      continue
    }

    const bytes = readFileSync(path)
    const ext = file.split(".").pop()!.toLowerCase()
    const contentType = TYPES[ext] ?? "application/octet-stream"
    console.log(`  ${field.padEnd(18)} ${state}`)
    console.log(`  ${" ".repeat(18)} ${APPLY ? "uploading" : "would upload"} ${file} (${Math.round(bytes.length / 1024)} KB, ${what})`)

    if (!APPLY) continue

    const key = `media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file}`
    const blob = await put(key, bytes, { access: "private", contentType })
    const asset = await prisma.mediaAsset.create({
      data: { name: file, blobUrl: blob.url, contentType, size: bytes.length },
    })
    updates[field] = mediaUrl(asset.id)
    console.log(`  ${" ".repeat(18)} -> ${updates[field]}`)
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to upload and update the site.")
    await prisma.$disconnect()
    return
  }
  if (!Object.keys(updates).length) {
    console.log("\nNothing to change.")
    await prisma.$disconnect()
    return
  }

  // Draft AND published. A published site serving dead URLs is the problem being
  // fixed, so waiting for someone to press Publish would leave it broken.
  await (prisma as any).surgeonSite.update({
    where: { slug },
    data: {
      content: { ...draft, ...updates } as any,
      ...(published ? { publishedContent: { ...published, ...updates } as any } : {}),
    },
  })
  console.log(`\nUpdated ${Object.keys(updates).length} image(s) on the draft${published ? " and the published snapshot" : ""}.`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
