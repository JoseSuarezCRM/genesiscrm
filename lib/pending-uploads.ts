import { list } from "@vercel/blob"
import { prisma } from "@/lib/prisma"

/**
 * Faxes uploaded while reading them (/api/fax/extract, under referrals/pending/)
 * that no referral's documents point to. Read-only; the cleanup cron deletes.
 */
export const PENDING_PREFIX = "referrals/pending/"

export async function findOrphanedPendingUploads(opts: { uploadedFrom: Date; uploadedBefore: Date }): Promise<{ checked: number; orphans: string[] }> {
  const candidates: string[] = []
  let cursor: string | undefined
  do {
    const page = await list({ prefix: PENDING_PREFIX, cursor, limit: 1000 })
    for (const b of page.blobs) {
      const at = new Date(b.uploadedAt).getTime()
      if (at >= opts.uploadedFrom.getTime() && at < opts.uploadedBefore.getTime()) candidates.push(b.url)
    }
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)

  const orphans: string[] = []
  for (let i = 0; i < candidates.length; i += 500) {
    const chunk = candidates.slice(i, i + 500)
    const attached = await prisma.document.findMany({ where: { fileUrl: { in: chunk } }, select: { fileUrl: true } })
    const keep = new Set(attached.map((d) => d.fileUrl))
    orphans.push(...chunk.filter((u) => !keep.has(u)))
  }
  return { checked: candidates.length, orphans }
}
