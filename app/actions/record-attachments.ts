"use server"

import { del } from "@vercel/blob"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { recordPermKey } from "@/lib/record-perm-key"

export interface RecordAttachmentDTO {
  id: string
  name: string
  url: string
  contentType: string
  size: number
  createdAt: string
}

export async function listRecordAttachments(recordType: string, recordId: string): Promise<RecordAttachmentDTO[]> {
  const session = await auth()
  if (!session?.user || !userCanLevel(session.user as any, recordPermKey(recordType), "VIEW")) return []
  const rows = await (prisma as any).recordAttachment.findMany({
    where: { recordType, recordId },
    orderBy: { createdAt: "desc" },
  })
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    url: `/api/record-attachments/${r.id}`,
    contentType: r.contentType,
    size: r.size,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function deleteRecordAttachment(id: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  const row = await (prisma as any).recordAttachment.findUnique({ where: { id } })
  if (!row) return { ok: true }
  if (!userCanLevel(session.user as any, recordPermKey(row.recordType), "EDIT")) return { error: "You don't have permission to remove this file." }
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(row.blobUrl).catch(() => {})
  await (prisma as any).recordAttachment.delete({ where: { id } }).catch(() => {})
  return { ok: true }
}
