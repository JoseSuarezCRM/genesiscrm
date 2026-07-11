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

function fmtDate(d: string | Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : ""
}

// The unified activity feed for a record: notes + associated tasks + activities.
export async function listRecordActivities(recordType: string, recordId: string): Promise<ActivityItem[]> {
  const session = await auth()
  if (!session?.user) return []
  const items: ActivityItem[] = []

  // Notes
  const notes = await (prisma as any).recordNote.findMany({
    where: { recordType, recordId }, orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  })
  for (const n of notes) items.push({ id: n.id, kind: "NOTE", title: "Note", body: n.body, date: n.createdAt, by: n.createdBy?.name ?? n.createdBy?.email ?? null })

  // Associated engagements (tasks / activities) via the generic association layer.
  const links = await (prisma as any).objectAssociation.findMany({
    where: { OR: [{ fromType: recordType, fromId: recordId }, { toType: recordType, toId: recordId }] },
  })
  const otherOf = (l: any, kind: string) =>
    (l.fromType === recordType && l.fromId === recordId && l.toType === kind) ? l.toId
    : (l.toType === recordType && l.toId === recordId && l.fromType === kind) ? l.fromId : null
  const taskIds = links.map((l: any) => otherOf(l, "TASK")).filter(Boolean)
  const activityIds = links.map((l: any) => otherOf(l, "ACTIVITY")).filter(Boolean)

  if (taskIds.length) {
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, include: { createdBy: { select: { name: true, email: true } }, assignedTo: { select: { name: true, email: true } } } })
    for (const t of tasks) {
      const bits = [`Status: ${t.status}`, t.dueDate ? `Due ${fmtDate(t.dueDate)}` : "", t.assignedTo ? `Assigned to ${t.assignedTo.name ?? t.assignedTo.email}` : ""].filter(Boolean)
      items.push({ id: t.id, kind: "TASK", title: t.title, body: bits.join(" · "), date: t.createdAt, by: t.createdBy?.name ?? t.createdBy?.email ?? null })
    }
  }
  if (activityIds.length) {
    const acts = await prisma.activity.findMany({ where: { id: { in: activityIds } }, include: { createdBy: { select: { name: true, email: true } }, practice: { select: { name: true } }, location: { select: { name: true } } } })
    for (const a of acts) {
      const where = [a.practice?.name, a.location?.name].filter(Boolean).join(" · ")
      items.push({ id: a.id, kind: "ACTIVITY", title: a.nextStep ? `Activity — next: ${a.nextStep}` : "Activity", body: [where, a.notes].filter(Boolean).join("\n"), date: a.date, by: a.createdBy?.name ?? a.createdBy?.email ?? null })
    }
  }

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

// Create a Task and associate it to the record (shows in its feed + the Tasks list).
export async function createTaskForRecord(recordType: string, recordId: string, data: { title: string; dueDate?: string; assignedToId?: string }) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  if (!data.title.trim()) return { error: "Task title is required." }
  const task = await prisma.task.create({
    data: {
      title: data.title.trim(),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assignedToId: data.assignedToId || null,
      createdById: uid,
    },
  })
  await (prisma as any).objectAssociation.create({ data: { fromType: "TASK", fromId: task.id, toType: recordType, toId: recordId } })
  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  return { success: true }
}
