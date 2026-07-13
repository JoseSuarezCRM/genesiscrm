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

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

// Phone → E.164 so it can be matched against SMS threads.
function toE164(p: string): string | null {
  const d = p.replace(/\D/g, "")
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d[0] === "1") return `+${d}`
  return d.length > 6 ? `+${d}` : null
}

// The record's email addresses / phone numbers, used to match emails + SMS.
async function contactInfoFor(recordType: string, recordId: string): Promise<{ emails: string[]; phones: string[] }> {
  if (recordType === "PROVIDER") {
    const d = await prisma.referringDoctor.findUnique({ where: { id: recordId }, select: { email: true, phone: true, officePhone: true } })
    return { emails: [d?.email].filter(Boolean) as string[], phones: [d?.phone, d?.officePhone].filter(Boolean) as string[] }
  }
  if (recordType === "PRACTICE") {
    const p = await prisma.referringPractice.findUnique({ where: { id: recordId }, select: { phone: true } })
    return { emails: [], phones: [p?.phone].filter(Boolean) as string[] }
  }
  if (recordType === "LOCATION") {
    const l = await prisma.practiceLocation.findUnique({ where: { id: recordId }, select: { phone: true } })
    return { emails: [], phones: [l?.phone].filter(Boolean) as string[] }
  }
  if (recordType.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: recordType.slice(3) } })
    const rec = await (prisma as any).customObjectRecord.findUnique({ where: { id: recordId } })
    if (!def || !rec) return { emails: [], phones: [] }
    const props: any[] = (def.properties as any[]) ?? []
    const vals: any = (rec.values as any) ?? {}
    return {
      emails: props.filter((p) => p.type === "EMAIL").map((p) => vals[p.id]).filter(Boolean),
      phones: props.filter((p) => p.type === "PHONE").map((p) => vals[p.id]).filter(Boolean),
    }
  }
  return { emails: [], phones: [] }
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

  // Legacy provider notes surface in the same timeline (read-only).
  if (recordType === "PROVIDER") {
    const pn = await prisma.providerNote.findMany({
      where: { providerId: recordId }, orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true, email: true } } },
    })
    for (const n of pn) items.push({ id: `pn_${n.id}`, kind: "NOTE", title: "Note", body: n.content, date: n.createdAt, by: n.createdBy?.name ?? n.createdBy?.email ?? null })
  }

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

  // Activities: association-linked, plus native FK links for built-in record types.
  const nativeWhere =
    recordType === "PROVIDER" ? { providers: { some: { doctorId: recordId } } } :
    recordType === "PRACTICE" ? { practiceId: recordId } :
    recordType === "LOCATION" ? { locationId: recordId } : null
  const actWhere: any = nativeWhere && activityIds.length ? { OR: [nativeWhere, { id: { in: activityIds } }] }
    : nativeWhere ? nativeWhere : activityIds.length ? { id: { in: activityIds } } : null
  if (actWhere) {
    const acts = await prisma.activity.findMany({ where: actWhere, include: { createdBy: { select: { name: true, email: true } }, practice: { select: { name: true } }, location: { select: { name: true } } } })
    for (const a of acts) {
      const where = [a.practice?.name, a.location?.name].filter(Boolean).join(" · ")
      items.push({ id: a.id, kind: "ACTIVITY", title: a.nextStep ? `Activity — next: ${a.nextStep}` : "Activity logged", body: [where, a.notes].filter(Boolean).join("\n"), date: a.date, by: a.createdBy?.name ?? a.createdBy?.email ?? null })
    }
  }

  // Emails + SMS: matched to the record's email address / phone number.
  const { emails, phones } = await contactInfoFor(recordType, recordId)
  if (emails.length) {
    const sent = await prisma.directEmail.findMany({
      where: { OR: [{ to: { hasSome: emails } }, { cc: { hasSome: emails } }] },
      orderBy: { sentAt: "desc" }, take: 50,
      include: { sentBy: { select: { name: true, email: true } } },
    })
    for (const e of sent) {
      items.push({ id: e.id, kind: "EMAIL", title: e.subject, body: stripHtml(e.body).slice(0, 400), date: e.sentAt, by: e.sentBy?.name ?? e.sentBy?.email ?? null })
    }
  }
  const e164 = phones.map(toE164).filter(Boolean) as string[]
  if (e164.length) {
    const threads = await prisma.smsThread.findMany({
      where: { phone: { in: e164 } },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 50, include: { sentBy: { select: { name: true, email: true } } } } },
    })
    for (const t of threads) {
      for (const m of t.messages) {
        items.push({
          id: m.id, kind: "SMS",
          title: String(m.direction) === "INBOUND" ? "SMS received" : "SMS sent",
          body: m.body, date: m.createdAt, by: m.sentBy?.name ?? m.sentBy?.email ?? null,
        })
      }
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
