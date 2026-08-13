import { NextRequest, NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"

// Vercel Cron (runs every minute) — fires task reminders. A task with a
// reminderMinutesBefore and a dueDate gets a notification once the reminder time
// has arrived (dueDate - minutes) and it hasn't already been sent.
export async function GET(req: NextRequest) {
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr

  const now = new Date()
  const due = await prisma.task.findMany({
    where: {
      reminderMinutesBefore: { not: null },
      reminderSentAt: null,
      dueDate: { not: null },
      status: { notIn: ["COMPLETED", "DEFERRED"] },
      assignedToId: { not: null },
    },
    select: { id: true, title: true, dueDate: true, reminderMinutesBefore: true, assignedToId: true },
    take: 500,
  })

  let sent = 0
  for (const t of due) {
    const fireAt = new Date(t.dueDate!.getTime() - (t.reminderMinutesBefore ?? 0) * 60000)
    if (fireAt > now) continue // not time yet
    await prisma.notification.create({
      data: {
        userId: t.assignedToId!,
        type: "TASK_REMINDER",
        message: `Reminder: "${t.title}" is due`,
        link: `/tasks?highlight=${t.id}`,
        taskId: t.id,
      },
    })
    await prisma.task.update({ where: { id: t.id }, data: { reminderSentAt: now } })
    sent++
  }

  return NextResponse.json({ sent })
}
