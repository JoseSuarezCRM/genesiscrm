"use server"

import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { mediaUrl } from "@/lib/media-url"

// Pull a signature's remote images into the media library.
//
// A pasted signature usually points at images hosted elsewhere — Mailchimp's CDN
// for the Genesis one. Those load for recipients, but only for recipients who
// allow remote images, and Outlook desktop blocks them by default. Once an image
// is ours it gets embedded as an inline cid: attachment at send time and always
// renders.
//
// Fetching happens server-side, which is the point: the browser can't read these
// cross-origin, and a cid:/local reference can't be fetched at all — those still
// need a manual upload.

const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]
const MAX_BYTES = 5 * 1024 * 1024
const MAX_IMAGES = 25

export interface ImportResult {
  html: string
  imported: number
  failed: { url: string; reason: string }[]
}

/** Every http(s) image src in the HTML that isn't already ours. */
function remoteImageUrls(html: string): string[] {
  const out: string[] = []
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const src = m[1]
    if (!/^https?:\/\//i.test(src)) continue // cid:, data:, local paths — not fetchable here
    if (/\/api\/media\/[A-Za-z0-9_-]+/.test(src)) continue // already imported
    if (!out.includes(src)) out.push(src)
  }
  return out
}

function extensionFor(contentType: string): string {
  return (contentType.split("/")[1] || "png").replace("+xml", "").split(";")[0]
}

export async function importSignatureImages(html: string): Promise<ImportResult> {
  const session = await auth()
  if (!session?.user) return { html, imported: 0, failed: [] }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { html, imported: 0, failed: [{ url: "", reason: "Storage isn't configured." }] }
  }

  const urls = remoteImageUrls(html).slice(0, MAX_IMAGES)
  if (!urls.length) return { html, imported: 0, failed: [] }

  let next = html
  let imported = 0
  const failed: { url: string; reason: string }[] = []

  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow" })
      if (!res.ok) { failed.push({ url, reason: `HTTP ${res.status}` }); continue }

      const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
      if (!ALLOWED.includes(contentType)) {
        failed.push({ url, reason: contentType ? `Not an image (${contentType})` : "Unknown type" })
        continue
      }
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length > MAX_BYTES) { failed.push({ url, reason: "Over 5 MB" }); continue }
      if (!bytes.length) { failed.push({ url, reason: "Empty file" }); continue }

      const base = (url.split("/").pop() || "image").split("?")[0].replace(/[^a-zA-Z0-9._-]/g, "_")
      const name = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${extensionFor(contentType)}`
      const key = `media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`
      const blob = await put(key, bytes, { access: "private", contentType })
      const asset = await prisma.mediaAsset.create({
        data: {
          name, blobUrl: blob.url, contentType, size: bytes.length,
          createdById: (session.user as any).id ?? null,
        },
        select: { id: true },
      })

      // Replace every occurrence — the same logo often appears more than once.
      const esc = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      next = next.replace(new RegExp(esc, "g"), mediaUrl(asset.id))
      imported++
    } catch (e) {
      failed.push({ url, reason: e instanceof Error ? e.message : "Fetch failed" })
    }
  }

  return { html: next, imported, failed }
}
