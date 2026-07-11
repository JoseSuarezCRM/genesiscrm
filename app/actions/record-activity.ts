"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"

export type ActivityKind = "NOTE" | "TASK" | "ACTIVITY" | "EMAIL" | "SMS" | "MEETING"

export interface ActivityItem {
  id: string
  kind: ActivityKind
  title: string
  body: string | null
  date: string | Date
  by: string | null
}

// Permission object key that gates editing a record of a given type.
function permKeyFor(recordType: string): string {
  if (recordType.startsWith("CO:")) return recordType
  return ({ REFERRAL: "REFERRALS", PROVIDER: "PROVIDERS", PRACTICE: "PRACTICES", LOCATION: "LOCATIONS", SURGERY: "SURGERY" } as Record<string, string>)[recordType] ?? recordType
}

function pathFor(recordType: string, recordId: string): string | null {
  if (recordType.startsWith("CO:")) return `/objects/${recordType.slice(3)}/${recordId}`
  return null
}

// The unified activity feed for a record. Notes today; tasks/activities/comms next.
export async function listRecordActivities(recordType: string, recordId: string): Promise<ActivityItem[]> {
  const session = await auth()
  if (!session?.user) return []

  const notes = await (prisma as any).recordNote.findMany({
    where: { recordType, recordId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  })

  const items: ActivityItem[] = notes.map((n: any) => ({
    id: n.id, kind: "NOTE" as const, title: "Note", body: n.body,
    date: n.createdAt, by: n.createdBy?.name ?? n.createdBy?.email ?? null,
  }))

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function addRecordNote(recordType: string, recordId: string, body: string) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  if (!body.trim()) return { error: "Note is empty." }
  await (prisma as any).recordNote.create({ data: { recordType, recordId, body: body.trim(), createdById: uid } })
  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  return { success: true }
}

export async function deleteRecordNote(id: string) {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }
  await (prisma as any).recordNote.delete({ where: { id } })
  return { success: true }
}
