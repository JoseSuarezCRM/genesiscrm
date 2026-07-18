"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { userCan } from "@/lib/permissions"
import { sendEmail, sendCalendarInvite } from "@/lib/graph-mailer"
import { buildIcs } from "@/lib/ics"
import { sendSMS } from "@/lib/twilio"
import { resolveMyFromEmail } from "@/app/actions/account"
import { revalidatePath } from "next/cache"
import { runTrigger_EngagementLogged } from "@/lib/automation-engine"

export type ActivityKind = "NOTE" | "TASK" | "ACTIVITY" | "EMAIL" | "SMS" | "MEETING" | "CALL"

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

function fmtDateTime(d: string | Date): string {
  return new Date(d).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#3?9;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Phone → E.164 so it can be matched against SMS threads.
function toE164(p: string): string | null {
  const d = p.replace(/\D/g, "")
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d[0] === "1") return `+${d}`
  return d.length > 6 ? `+${d}` : null
}

// Built-in objects that carry a customProperties JSON bag, mapped to their
// CustomProperty entityType. Custom EMAIL/PHONE properties feed the buttons + feed.
const CP_CONTACT: Record<string, { entity: string; delegate: () => any }> = {
  REFERRAL: { entity: "REFERRAL", delegate: () => prisma.referral },
  PROVIDER: { entity: "PROVIDER", delegate: () => prisma.referringDoctor },
  PRACTICE: { entity: "PRACTICE", delegate: () => prisma.referringPractice },
  LOCATION: { entity: "LOCATION", delegate: () => prisma.practiceLocation },
  SURGERY: { entity: "SURGERY", delegate: () => (prisma as any).surgeryCase },
}

// Custom EMAIL/PHONE property values on a built-in record.
async function customPropContact(recordType: string, recordId: string): Promise<{ emails: string[]; phones: string[] }> {
  const meta = CP_CONTACT[recordType]
  if (!meta) return { emails: [], phones: [] }
  const [rec, defs] = await Promise.all([
    meta.delegate().findUnique({ where: { id: recordId }, select: { customProperties: true } }),
    prisma.customProperty.findMany({ where: { entityType: meta.entity as any, type: { in: ["EMAIL", "PHONE"] } as any } }),
  ])
  const bag: Record<string, any> = (rec?.customProperties as any) ?? {}
  const emails: string[] = [], phones: string[] = []
  for (const d of defs) {
    const v = bag[d.id]
    if (!v) continue
    if (d.type === "EMAIL") emails.push(v)
    else phones.push(v)
  }
  return { emails, phones }
}

// The record's email addresses / phone numbers, used to prefill Email/SMS and to
// match emails + SMS into the activity feed — native columns AND custom properties.
async function contactInfoFor(recordType: string, recordId: string): Promise<{ emails: string[]; phones: string[] }> {
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

  let base: { emails: string[]; phones: string[] } = { emails: [], phones: [] }
  if (recordType === "REFERRAL") {
    const r = await prisma.referral.findUnique({ where: { id: recordId }, select: { patientEmail: true, patientPhone: true } })
    base = { emails: [r?.patientEmail].filter(Boolean) as string[], phones: [r?.patientPhone].filter(Boolean) as string[] }
  } else if (recordType === "PROVIDER") {
    const d = await prisma.referringDoctor.findUnique({ where: { id: recordId }, select: { email: true, phone: true, officePhone: true } })
    base = { emails: [d?.email].filter(Boolean) as string[], phones: [d?.phone, d?.officePhone].filter(Boolean) as string[] }
  } else if (recordType === "PRACTICE") {
    const p = await prisma.referringPractice.findUnique({ where: { id: recordId }, select: { phone: true } })
    base = { emails: [], phones: [p?.phone].filter(Boolean) as string[] }
  } else if (recordType === "LOCATION") {
    const l = await prisma.practiceLocation.findUnique({ where: { id: recordId }, select: { phone: true } })
    base = { emails: [], phones: [l?.phone].filter(Boolean) as string[] }
  } else if (recordType === "SURGERY") {
    const s = await (prisma as any).surgeryCase.findUnique({ where: { id: recordId }, select: { email: true } })
    base = { emails: [s?.email].filter(Boolean) as string[], phones: [] }
  }

  const custom = await customPropContact(recordType, recordId)
  return {
    emails: Array.from(new Set([...base.emails, ...custom.emails])),
    phones: Array.from(new Set([...base.phones, ...custom.phones])),
  }
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
  for (const n of notes) {
    const kind: ActivityKind = (["NOTE", "CALL", "MEETING"].includes(n.kind) ? n.kind : "NOTE") as ActivityKind
    const meta: any = n.meta ?? {}
    const extras = [
      kind === "CALL" && meta.outcome ? `Outcome: ${meta.outcome}` : "",
      kind === "MEETING" && n.occurredAt ? fmtDateTime(n.occurredAt) : "",
      kind === "MEETING" && meta.location ? meta.location : "",
      kind === "MEETING" && meta.attendees?.length ? `With ${meta.attendees.join(", ")}` : "",
    ].filter(Boolean).join(" · ")
    items.push({
      id: n.id, kind,
      title: n.title || (kind === "CALL" ? "Call logged" : kind === "MEETING" ? "Meeting" : "Note"),
      body: [extras, n.body].filter(Boolean).join("\n"),
      date: n.occurredAt ?? n.createdAt,
      by: n.createdBy?.name ?? n.createdBy?.email ?? null,
    })
  }

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
  const emailIds = links.map((l: any) => otherOf(l, "EMAIL")).filter(Boolean)

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
  const emailOr: any[] = []
  if (emails.length) emailOr.push({ to: { hasSome: emails } }, { cc: { hasSome: emails } })
  if (emailIds.length) emailOr.push({ id: { in: emailIds } })
  if (emailOr.length) {
    const sent = await prisma.directEmail.findMany({
      where: { OR: emailOr },
      orderBy: { sentAt: "desc" }, take: 50,
      include: { sentBy: { select: { name: true, email: true } } },
    })
    for (const e of sent) {
      items.push({ id: e.id, kind: "EMAIL", title: e.subject, body: stripHtml(e.body), date: e.sentAt, by: e.sentBy?.name ?? e.sentBy?.email ?? null })
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
  await runTrigger_EngagementLogged(recordType, recordId, "NOTE", uid).catch(() => {})
  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  return { success: true }
}

// Deleting engagements (notes, calls, meetings, emails, SMS) needs the
// DELETE_ACTIVITIES capability — enforced here, not just hidden in the UI.
async function requireDeleteActivities() {
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" as const }
  if (!userCan(session.user as any, "DELETE_ACTIVITIES")) return { error: "You don't have permission to delete activities." as const }
  return { ok: true as const }
}

export async function deleteRecordNote(id: string) {
  const gate = await requireDeleteActivities()
  if ("error" in gate) return gate
  await (prisma as any).recordNote.delete({ where: { id } })
  return { success: true }
}

// Deletes a logged email (DirectEmail row) — removes it from the record's feed.
export async function deleteRecordEmail(id: string) {
  const gate = await requireDeleteActivities()
  if ("error" in gate) return gate
  await prisma.directEmail.delete({ where: { id } }).catch(() => {})
  return { success: true }
}

// Deletes a single SMS message from its thread.
export async function deleteRecordSms(id: string) {
  const gate = await requireDeleteActivities()
  if ("error" in gate) return gate
  await prisma.smsMessage.delete({ where: { id } }).catch(() => {})
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

// The record's email / phone, so the composer can pre-fill who we're contacting.
export async function getRecordContact(recordType: string, recordId: string) {
  const session = await auth()
  if (!session?.user) return { emails: [], phones: [] }
  return contactInfoFor(recordType, recordId)
}

// Email sent straight from the record — always from the current user's own address.
export async function sendEmailFromRecord(recordType: string, recordId: string, data: { to: string; subject: string; body: string }) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  const to = data.to.trim()
  if (!to || !data.subject.trim() || !data.body.trim()) return { error: "To, subject and message are required." }

  const fromEmail = await resolveMyFromEmail(null)
  if (!fromEmail) return { error: "You don't have a sending address yet. Set one up in Settings → My Account." }

  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;line-height:1.6;">${data.body.replace(/\n/g, "<br/>")}</div>`
  const result = await sendEmail(to, data.subject.trim(), html, { fromEmail })

  const rec = await prisma.directEmail.create({
    data: {
      to: [to], cc: [], bcc: [],
      subject: data.subject.trim(), body: data.body.trim(),
      success: result.success, error: result.success ? null : (result.error ?? "Unknown error"),
      sentById: uid,
    },
  })
  // Link it to the record explicitly, so it stays on the timeline even if the address changes.
  await (prisma as any).objectAssociation.create({
    data: { fromType: "EMAIL", fromId: rec.id, toType: recordType, toId: recordId },
  }).catch(() => {})

  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  if (!result.success) return { error: result.error ?? "Email failed to send." }
  return { success: true }
}

// SMS sent from the record. sendSMS stores the thread + message, so it lands on the timeline.
export async function sendSmsFromRecord(recordType: string, recordId: string, data: { to: string; body: string }) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  if (!data.to.trim() || !data.body.trim()) return { error: "Phone number and message are required." }
  const result = await sendSMS(data.to.trim(), data.body.trim())
  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  if (!result.success) return { error: result.error ?? "SMS failed to send." }
  return { success: true }
}

export async function logCall(recordType: string, recordId: string, data: { body: string; outcome?: string; occurredAt?: string }) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  if (!data.body.trim()) return { error: "Call notes are required." }
  await (prisma as any).recordNote.create({
    data: {
      recordType, recordId, kind: "CALL", title: "Call logged",
      body: data.body.trim(),
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
      meta: data.outcome ? { outcome: data.outcome } : undefined,
      createdById: uid,
    },
  })
  await runTrigger_EngagementLogged(recordType, recordId, "CALL", uid).catch(() => {})
  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  return { success: true }
}

// Log a meeting on the record and, optionally, send a real calendar invite to the attendees.
export async function logMeeting(recordType: string, recordId: string, data: {
  title: string; start: string; durationMins?: number; location?: string; body?: string; attendees?: string[]; sendInvite?: boolean
}) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  if (!data.title.trim() || !data.start) return { error: "Meeting title and start time are required." }

  const start = new Date(data.start)
  if (isNaN(start.getTime())) return { error: "Invalid start time." }
  const end = new Date(start.getTime() + (data.durationMins ?? 30) * 60_000)
  const attendees = (data.attendees ?? []).map((a) => a.trim()).filter(Boolean)

  let inviteError: string | null = null
  if (data.sendInvite && attendees.length) {
    const fromEmail = await resolveMyFromEmail(null)
    if (!fromEmail) {
      inviteError = "Meeting logged, but no sending address is set up for you (Settings → My Account), so no invite was sent."
    } else {
      const ics = buildIcs({
        uid: `mtg-${Date.now()}@genesisortho.com`,
        start, end,
        title: data.title.trim(),
        description: data.body?.trim() || undefined,
        location: data.location?.trim() || undefined,
        organizer: { email: fromEmail, name: "Genesis Ortho" },
        attendees: attendees.map((email) => ({ email })),
      })
      const when = start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
      const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;line-height:1.6;">
        <p><strong>${data.title.trim()}</strong></p><p>${when} (Central)</p>
        ${data.location?.trim() ? `<p>${data.location.trim()}</p>` : ""}
        ${data.body?.trim() ? `<p>${data.body.trim().replace(/\n/g, "<br/>")}</p>` : ""}</div>`
      const res = await sendCalendarInvite(attendees, data.title.trim(), html, ics, undefined, fromEmail)
      if (!res.success) inviteError = `Meeting logged, but the invite failed: ${res.error ?? "unknown error"}`
    }
  }

  await (prisma as any).recordNote.create({
    data: {
      recordType, recordId, kind: "MEETING",
      title: data.title.trim(),
      body: data.body?.trim() ?? "",
      occurredAt: start,
      meta: { location: data.location?.trim() || null, attendees, durationMins: data.durationMins ?? 30, invited: !!data.sendInvite },
      createdById: uid,
    },
  })
  await runTrigger_EngagementLogged(recordType, recordId, "MEETING", uid).catch(() => {})

  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  if (inviteError) return { error: inviteError }
  return { success: true }
}

// Just the logged calls (RecordNote kind=CALL) for a record — used by the Call Log card.
export async function listRecordCalls(recordType: string, recordId: string) {
  const session = await auth()
  if (!session?.user) return []
  const rows = await (prisma as any).recordNote.findMany({
    where: { recordType, recordId, kind: "CALL" },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true, email: true } } },
  })
  return rows.map((r: any) => ({
    id: r.id,
    outcome: (r.meta as any)?.outcome ?? null,
    body: r.body as string,
    date: (r.occurredAt ?? r.createdAt) as Date,
    by: r.createdBy?.name ?? r.createdBy?.email ?? null,
  }))
}
