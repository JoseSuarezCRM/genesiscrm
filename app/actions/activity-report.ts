"use server"

import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireAccess } from "@/lib/auth-guard"
import { sendEmail } from "@/lib/graph-mailer"
import { resolveMyFromEmail } from "@/app/actions/account"
import { buildActivityReportHtml, type ReportActivity } from "@/lib/activity-report"

// Email a formatted report of the given activities to one or more recipients.
export async function emailActivityReport(input: { activityIds: string[]; to: string[]; subject?: string; message?: string }) {
  await requireAccess("ACTIVITIES", "VIEW")
  const session = await auth()
  if (!session?.user) return { error: "Unauthorized" }

  const to = Array.from(new Set((input.to ?? []).map((s) => s.trim()).filter(Boolean)))
  if (to.length === 0) return { error: "Add at least one recipient." }
  if (!input.activityIds?.length) return { error: "There are no activities to report." }

  const rows = await prisma.activity.findMany({
    where: { id: { in: input.activityIds } },
    orderBy: { date: "desc" },
    include: {
      practice: { select: { name: true } },
      location: { select: { name: true, address: true } },
      providers: { include: { doctor: { select: { name: true, title: true } } } },
      tags: { include: { tag: { select: { name: true, color: true } } } },
      createdBy: { select: { name: true, email: true } },
    },
  })
  if (rows.length === 0) return { error: "No matching activities were found." }

  const activities: ReportActivity[] = rows.map((a) => ({
    id: a.id,
    date: a.date,
    practice: a.practice ? { name: a.practice.name } : null,
    location: a.location ? { name: a.location.name, address: a.location.address } : null,
    providers: a.providers.map((p) => ({ doctor: { name: p.doctor.name, title: p.doctor.title } })),
    nextStep: a.nextStep, frontDesk: a.frontDesk, flyer: a.flyer, notes: a.notes,
    rating: a.rating, meetingRating: a.meetingRating,
    tags: a.tags.map((t) => ({ name: t.tag.name, color: t.tag.color })),
    createdBy: a.createdBy ? { name: a.createdBy.name, email: a.createdBy.email } : null,
  }))

  const me = session.user as any
  const generatedBy = me.name || me.email
  const html = buildActivityReportHtml(activities, { generatedBy, message: input.message })
  const subject = (input.subject && input.subject.trim()) || `Activity Report — ${activities.length} ${activities.length === 1 ? "activity" : "activities"}`

  const fromEmail = await resolveMyFromEmail(null)
  const res = await sendEmail(to, subject, html, fromEmail ? { fromEmail } : { sender: "referrals" })
  if (!res.success) return { error: res.error ?? "The report failed to send." }
  return { success: true as const, count: activities.length, recipients: to.length }
}
