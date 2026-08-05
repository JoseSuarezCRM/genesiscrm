"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { userCan } from "@/lib/permissions"
import { sendEmail, sendEmailTracked, replyToMessage, sendCalendarInvite, type EmailAttachment } from "@/lib/graph-mailer"
import { buildIcs } from "@/lib/ics"
import { sendSMS } from "@/lib/twilio"
import { resolveMyFromEmail } from "@/app/actions/account"
import { revalidatePath } from "next/cache"
import { runTrigger_EngagementLogged } from "@/lib/automation-engine"
import { resolveMessageTokens, type MessageTokenGroup } from "@/lib/message-tokens"
import { MESSAGE_TOKEN_GROUPS } from "@/lib/message-tokens"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { buildRecordTokenVars as recordTokenVars, contactInfoFor, CP_CONTACT, snakeToken } from "@/lib/record-token-vars"
import type { OutreachChannel } from "@prisma/client"

const OBJECT_LABELS: Record<string, string> = { REFERRAL: "Referral", PROVIDER: "Provider", PRACTICE: "Practice", LOCATION: "Location", SURGERY: "Surgery" }

export type ActivityKind = "NOTE" | "TASK" | "ACTIVITY" | "EMAIL" | "SMS" | "MEETING" | "CALL"

export interface ActivityItem {
  id: string
  kind: ActivityKind
  title: string
  body: string | null
  date: string | Date
  by: string | null
  /** EMAIL items in a tracked Graph thread can be replied to from the app. */
  canReply?: boolean
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

// CP_CONTACT, contactInfoFor + the per-object token resolver live in
// lib/record-token-vars.ts (shared with the automation engine).

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
  if (emails.length) {
    // Outbound: the record is a recipient. Inbound (a reply): the record is the sender.
    emailOr.push({ to: { hasSome: emails } }, { cc: { hasSome: emails } }, { fromEmail: { in: emails } })
  }
  if (emailIds.length) emailOr.push({ id: { in: emailIds } })
  if (emailOr.length) {
    const sent = await prisma.directEmail.findMany({
      where: { OR: emailOr },
      orderBy: { sentAt: "desc" }, take: 50,
      include: { sentBy: { select: { name: true, email: true } } },
    })
    for (const e of sent) {
      const inbound = (e as any).direction === "INBOUND"
      const by = inbound ? ((e as any).fromEmail ?? "them") : (e.sentBy?.name ?? e.sentBy?.email ?? null)
      items.push({ id: e.id, kind: "EMAIL", title: inbound ? `↩ ${e.subject}` : e.subject, body: stripHtml(e.body), date: e.sentAt, by, canReply: !!(e as any).conversationId })
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

// (recordTokenVars is imported from lib/record-token-vars as buildRecordTokenVars.)

// The Fields menu for the composer: every property of THIS record's object (native
// + custom), plus the curated cross-object catalog for referrals. Built live from
// the schema, so newly-created custom properties appear automatically.
export async function getRecordTokenGroups(recordType: string, recordId: string): Promise<MessageTokenGroup[]> {
  return getObjectTokenGroups(recordType)
}

// Same catalog, keyed only by object type (no specific record) — used by the
// document-template builder's Fields menu.
export async function getObjectTokenGroups(recordType: string): Promise<MessageTokenGroup[]> {
  const session = await auth()
  if (!session?.user) return []

  if (recordType.startsWith("CO:")) {
    const def = await (prisma as any).customObjectDef.findUnique({ where: { key: recordType.slice(3) }, select: { singular: true, properties: true } }).catch(() => null)
    const tokens = ((def?.properties as any[]) ?? []).map((p) => ({ label: p.name as string, value: `{${p.internalName || snakeToken(p.name)}}` }))
    return tokens.length ? [{ group: def?.singular ?? "Record", tokens }] : []
  }

  const meta = CP_CONTACT[recordType]
  const nativeTokens = (RECORD_FIELDS[recordType] ?? []).map((f) => ({ label: f.label, value: `{${snakeToken(f.key)}}` }))
  const customs = meta
    ? await prisma.customProperty.findMany({ where: { entityType: meta.entity as any }, orderBy: { name: "asc" } }).catch(() => [])
    : []
  const customTokens = customs.map((c) => ({ label: c.name, value: `{${(c as any).internalName || snakeToken(c.name)}}` }))

  const groups: MessageTokenGroup[] = []
  const own = [...nativeTokens, ...customTokens]
  if (own.length) groups.push({ group: OBJECT_LABELS[recordType] ?? recordType, tokens: own })

  // Referrals can resolve related-object tokens (provider, practice, surgery, links).
  if (recordType === "REFERRAL") {
    for (const g of MESSAGE_TOKEN_GROUPS) if (!["Patient", "Referral"].includes(g.group)) groups.push(g)
  }
  return groups
}

// Templates for the composer, pre-resolved against this record so inserting one drops
// in ready-to-send text (subject + body). Used by the Email/SMS popups.
export async function getComposeTemplates(recordType: string, recordId: string, channel: OutreachChannel) {
  const session = await auth()
  if (!session?.user) return []
  const templates = await prisma.messageTemplate.findMany({
    where: { channel, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, subject: true, body: true },
  })
  const vars = await recordTokenVars(recordType, recordId)
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: resolveMessageTokens(t.subject ?? "", vars),
    body: resolveMessageTokens(t.body, vars),
  }))
}

// The record's email / phone, so the composer can pre-fill who we're contacting.
export async function getRecordContact(recordType: string, recordId: string) {
  const session = await auth()
  if (!session?.user) return { emails: [], phones: [] }
  return contactInfoFor(recordType, recordId)
}

// Email sent straight from the record — always from the current user's own address.
export async function sendEmailFromRecord(recordType: string, recordId: string, data: { to: string; subject: string; body: string; cc?: string[]; bcc?: string[]; attachments?: EmailAttachment[] }) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  const to = data.to.trim()
  // The body may be HTML (rich editor); check it has real text, not just tags.
  const bareBody = data.body.replace(/<[^>]*>/g, "").replace(/&nbsp;| /g, " ").trim()
  if (!to || !data.subject.trim() || !bareBody) return { error: "To, subject and message are required." }

  const fromEmail = await resolveMyFromEmail(null)
  if (!fromEmail) return { error: "You don't have a sending address yet. Set one up in Settings → My Account." }

  // Resolve any personalization tokens the sender left in (e.g. from a template).
  const vars = await recordTokenVars(recordType, recordId)
  const subject = resolveMessageTokens(data.subject.trim(), vars)
  const bodyText = resolveMessageTokens(data.body.trim(), vars)
  const cc = (data.cc ?? []).map((s) => s.trim()).filter(Boolean)
  const bcc = (data.bcc ?? []).map((s) => s.trim()).filter(Boolean)

  // Rich-editor HTML is used as-is; plain text keeps its line breaks.
  const looksHtml = /<[a-z!/][^>]*>/i.test(bodyText)
  const inner = looksHtml ? bodyText : bodyText.replace(/\n/g, "<br/>")
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;line-height:1.6;">${inner}</div>`
  // Tracked send captures the thread ids for threading/replies, but it needs
  // Mail.ReadWrite (draft). If that isn't granted, fall back to the plain send
  // (Mail.Send only) so email always works — threading just won't be available.
  const attachments = data.attachments ?? []
  const tracked = await sendEmailTracked(fromEmail, to, subject, html, { cc, bcc, attachments })
  const result = tracked.success ? tracked : { success: false, error: tracked.error }
  let conversationId = tracked.conversationId
  let internetMessageId = tracked.internetMessageId
  let graphMessageId = tracked.graphMessageId
  if (!tracked.success) {
    const plain = await sendEmail(to, subject, html, { fromEmail, cc, bcc, attachments })
    result.success = plain.success
    result.error = plain.error
    conversationId = internetMessageId = graphMessageId = undefined
  }

  const rec = await prisma.directEmail.create({
    data: {
      to: [to], cc, bcc,
      subject, body: bodyText,
      success: result.success, error: result.success ? null : (result.error ?? "Unknown error"),
      direction: "OUTBOUND", fromEmail, mailbox: fromEmail,
      conversationId, internetMessageId, graphMessageId,
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

// Reply to an email in the app, keeping it in the same Graph thread. `emailId` is
// any DirectEmail row in the conversation (usually the message being replied to).
export async function replyToEmailThread(recordType: string, recordId: string, emailId: string, body: string) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  const session = await auth()
  const uid = (session!.user as any).id
  if (!body.trim()) return { error: "Reply is empty." }

  const email = await prisma.directEmail.findUnique({ where: { id: emailId } })
  if (!email?.conversationId) return { error: "This email isn't part of a tracked thread yet." }

  // Reply to the most recent message in the thread that we can act on (prefer the
  // latest inbound so the reply goes back to the person who wrote in).
  const target = await prisma.directEmail.findFirst({
    where: { conversationId: email.conversationId, graphMessageId: { not: null }, mailbox: { not: null } },
    orderBy: [{ direction: "asc" }, { sentAt: "desc" }], // INBOUND sorts before OUTBOUND
  })
  if (!target?.graphMessageId || !target.mailbox) return { error: "Can't reply — the original message isn't available in the mailbox." }

  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b;line-height:1.6;">${body.replace(/\n/g, "<br/>")}</div>`
  const result = await replyToMessage(target.mailbox, target.graphMessageId, html)
  if (!result.success) return { error: result.error ?? "Reply failed to send." }

  const to = target.direction === "INBOUND" ? (target.fromEmail ?? "") : (target.to[0] ?? "")
  const rec = await prisma.directEmail.create({
    data: {
      to: to ? [to] : [], cc: [], bcc: [],
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      body: body.trim(), success: true,
      direction: "OUTBOUND", fromEmail: target.mailbox, mailbox: target.mailbox,
      conversationId: email.conversationId, sentById: uid,
    },
  })
  await (prisma as any).objectAssociation.create({
    data: { fromType: "EMAIL", fromId: rec.id, toType: recordType, toId: recordId },
  }).catch(() => {})

  const p = pathFor(recordType, recordId)
  if (p) revalidatePath(p)
  return { success: true }
}

// SMS sent from the record. sendSMS stores the thread + message, so it lands on the timeline.
export async function sendSmsFromRecord(recordType: string, recordId: string, data: { to: string; body: string }) {
  await requireAccess(permKeyFor(recordType), "EDIT")
  if (!data.to.trim() || !data.body.trim()) return { error: "Phone number and message are required." }
  const vars = await recordTokenVars(recordType, recordId)
  const body = resolveMessageTokens(data.body.trim(), vars)
  const result = await sendSMS(data.to.trim(), body)
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
