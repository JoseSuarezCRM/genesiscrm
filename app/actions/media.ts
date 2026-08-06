"use server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"

// Absolute base URL for building public asset links usable in emails/PDFs.
export function appBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  ).replace(/\/$/, "")
}

// Public URL for a media asset — served (bytes only) via our own route so it
// works in the builder, in recipients' inboxes, and in generated PDFs.
export function mediaUrl(id: string): string {
  return `${appBaseUrl()}/api/media/${id}`
}

export type MediaAssetDTO = {
  id: string
  name: string
  url: string
  contentType: string
  size: number
  createdAt: string
}

function canManage(user: any): boolean {
  return userCanLevel(user, "TEMPLATES", "EDIT")
}

export async function listMediaAssets(): Promise<MediaAssetDTO[]> {
  const session = await auth()
  if (!session?.user || !canManage(session.user)) return []
  const rows = await prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: 200 })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: mediaUrl(r.id),
    contentType: r.contentType,
    size: r.size,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function deleteMediaAsset(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user || !canManage(session.user)) return { ok: false, error: "Unauthorized" }
  await prisma.mediaAsset.delete({ where: { id } }).catch(() => {})
  return { ok: true }
}
