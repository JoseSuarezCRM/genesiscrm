/**
 * Put a surgeon's real files — photographs and rehab protocol PDFs — into the
 * media library and onto their site.
 *
 *   npx tsx scripts/seed-surgeon-assets.ts nolan-horner           # dry run
 *   npx tsx scripts/seed-surgeon-assets.ts nolan-horner --apply
 *
 * Why this is needed: the surgeon record was imported into the CRM before the
 * site app's assets were rescued from Lovable's CDN, so the stored paths are
 * still `/__l5e/assets-v1/…` — pointers into infrastructure this org does not
 * control and which answer 404. The moment the site reads its content from here,
 * every one of those breaks.
 *
 * The replacements are the real files from the site repo, uploaded to the media
 * library so they get a stable public /api/media/<id> address. That address is
 * public by design: the site runs on separate infrastructure with no session
 * here, and a file behind auth cannot be fetched by a browser on another domain.
 *
 * ── Two passes, and the second is the one that matters ────────────────────────
 *
 * The first pass fills the four named image fields, including when they are
 * blank — a new surgeon has empty fields, not dead ones.
 *
 * The second walks the ENTIRE content tree for any remaining `/__l5e/` string
 * and repairs it wherever it sits. That pass exists because the first one was
 * written against a list of fields someone thought of, and it missed four rehab
 * protocol PDFs buried in `protocolGroups[].items[].href` — post-operative
 * instructions, which a patient clicking from the site would have been handed a
 * 404 for. A named list only ever covers what was named; the tree walk covers
 * what is actually there.
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
const ASSETS = join(SITE_REPO, "src/assets")
const APPLY = process.argv.includes("--apply")

/**
 * The image fields, named rather than `keyof SurgeonSiteContent`: most of that
 * contract is arrays and objects, so the wider key type would let a string be
 * written over `clinics`.
 */
type ImageField = "headshot" | "headshotSecondary" | "portraitAtWork" | "schemaImagePath"

/** Which file fills which image field. Field names match the shared contract. */
const IMAGES: { field: ImageField; file: string; what: string }[] = [
  { field: "headshot", file: "nolan-headshot.webp", what: "main portrait" },
  { field: "headshotSecondary", file: "nolan-headshot2.webp", what: "About page hero" },
  { field: "portraitAtWork", file: "nolan-or.webp", what: "in the operating room" },
  { field: "schemaImagePath", file: "nolan-headshot-schema.png", what: "search-result image" },
]

const TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
}

/** A path this org cannot serve. */
const isDead = (v: string) => v.startsWith("/__l5e/")

/** Upload once per file, however many places reference it. */
const uploaded = new Map<string, string>()

async function uploadAsset(file: string): Promise<string | null> {
  if (uploaded.has(file)) return uploaded.get(file)!

  const path = join(ASSETS, file)
  if (!existsSync(path)) return null

  const bytes = readFileSync(path)
  const ext = file.split(".").pop()!.toLowerCase()
  const contentType = TYPES[ext] ?? "application/octet-stream"
  const key = `media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file}`
  const blob = await put(key, bytes, { access: "private", contentType })
  const asset = await prisma.mediaAsset.create({
    data: { name: file, blobUrl: blob.url, contentType, size: bytes.length },
  })
  const url = mediaUrl(asset.id)
  uploaded.set(file, url)
  return url
}

const sizeOf = (file: string) => {
  const path = join(ASSETS, file)
  return existsSync(path) ? `${Math.round(readFileSync(path).length / 1024)} KB` : "missing"
}

/**
 * Rewrite every dead path in a value tree, in place on a copy.
 *
 * Returns the repaired tree plus what it did, so a dry run can report exactly
 * the same set of changes an `--apply` would make.
 */
async function repairTree(
  node: unknown,
  path: string,
  log: { path: string; file: string; found: boolean }[],
): Promise<unknown> {
  if (typeof node === "string") {
    if (!isDead(node)) return node
    const file = node.split("/").pop()!
    const found = existsSync(join(ASSETS, file))
    log.push({ path, file, found })
    if (!found || !APPLY) return node
    const url = await uploadAsset(file)
    return url ?? node
  }
  if (Array.isArray(node)) {
    const out: unknown[] = []
    for (let i = 0; i < node.length; i++) out.push(await repairTree(node[i], `${path}[${i}]`, log))
    return out
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = await repairTree(v, path ? `${path}.${k}` : k, log)
    }
    return out
  }
  return node
}

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error("usage: seed-surgeon-assets.ts <slug> [--apply]")
    process.exit(1)
  }

  const site = await (prisma as any).surgeonSite.findUnique({ where: { slug } })
  if (!site) {
    console.error(`No surgeon site with slug "${slug}".`)
    process.exit(1)
  }

  let draft = parseContent(site.content)
  let published = site.publishedContent ? parseContent(site.publishedContent) : null

  console.log(`${slug} — ${site.domain} (${site.status})\n`)
  console.log("Photographs")

  // ── Pass 1: the named image fields ────────────────────────────────────────
  const updates: Partial<Record<ImageField, string>> = {}
  for (const { field, file, what } of IMAGES) {
    const current = String(draft[field] ?? "")
    const empty = current === ""
    const dead = isDead(current)
    const state = empty ? "empty" : dead ? "DEAD Lovable CDN path" : "already a real url"

    if (!existsSync(join(ASSETS, file))) {
      console.log(`  ${field.padEnd(18)} ${state} — but ${file} is not in the site repo, skipping`)
      continue
    }
    if (!empty && !dead) {
      console.log(`  ${field.padEnd(18)} ${state}, leaving alone`)
      continue
    }

    console.log(`  ${field.padEnd(18)} ${state}`)
    console.log(`  ${" ".repeat(18)} ${APPLY ? "uploading" : "would upload"} ${file} (${sizeOf(file)}, ${what})`)
    if (!APPLY) continue

    const url = await uploadAsset(file)
    if (url) {
      updates[field] = url
      console.log(`  ${" ".repeat(18)} -> ${url}`)
    }
  }
  if (Object.keys(updates).length) draft = { ...draft, ...updates }
  if (published && Object.keys(updates).length) published = { ...published, ...updates }

  // ── Pass 2: everything else still pointing at the dead CDN ────────────────
  console.log("\nAnything else pointing at the dead CDN")
  const draftLog: { path: string; file: string; found: boolean }[] = []
  draft = (await repairTree(draft, "", draftLog)) as SurgeonSiteContent
  const pubLog: { path: string; file: string; found: boolean }[] = []
  if (published) published = (await repairTree(published, "", pubLog)) as SurgeonSiteContent

  const all = [...draftLog, ...pubLog]
  if (!all.length) {
    console.log("  none")
  } else {
    for (const e of draftLog) {
      const mark = e.found ? (APPLY ? `-> ${uploaded.get(e.file)}` : "would upload") : "NOT IN THE SITE REPO — left dead"
      console.log(`  ${e.path}`)
      console.log(`  ${" ".repeat(4)}${e.file} (${sizeOf(e.file)}) ${mark}`)
    }
    const orphans = all.filter((e) => !e.found)
    if (orphans.length) {
      console.log(`\n  ${orphans.length} reference(s) have no file in ${ASSETS} and stay broken.`)
    }
  }

  const changed = Object.keys(updates).length + draftLog.filter((e) => e.found).length
  if (!APPLY) {
    console.log(`\nDry run — ${changed} change(s). Re-run with --apply to upload and update the site.`)
    await prisma.$disconnect()
    return
  }
  if (!changed) {
    console.log("\nNothing to change.")
    await prisma.$disconnect()
    return
  }

  // Draft AND published. A published site serving dead URLs is the problem being
  // fixed, so waiting for someone to press Publish would leave it broken.
  await (prisma as any).surgeonSite.update({
    where: { slug },
    data: {
      content: draft as any,
      ...(published ? { publishedContent: published as any } : {}),
    },
  })
  console.log(`\nUpdated ${changed} reference(s) on the draft${published ? " and the published snapshot" : ""}.`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
