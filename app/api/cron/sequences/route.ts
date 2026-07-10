import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/graph-mailer"
import { resolveWorkflowSender } from "@/lib/sender-resolve"
import { sendSMS } from "@/lib/twilio"
import { buildReferralVars, resolveMessageTokens, REFERRAL_TOKEN_SELECT } from "@/lib/message-tokens"

function resolveBody(template: string, referral: any): string {
  return resolveMessageTokens(template, buildReferralVars(referral))
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  // Fetch all PENDING runs that are due
  const dueRuns = await prisma.sequenceStepRun.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    include: {
      step: true,
      enrollment: {
        include: {
          sequence: { select: { id: true, name: true } },
          referral: {
            select: {
              id: true,
              ...REFERRAL_TOKEN_SELECT,
            },
          },
        },
      },
    },
    take: 100, // cap per run to avoid timeouts
  })

  let sent = 0, failed = 0, skipped = 0

  for (const run of dueRuns) {
    const { enrollment, step } = run

    // Skip if enrollment is no longer active
    if (enrollment.status !== "ACTIVE") {
      await prisma.sequenceStepRun.update({
        where: { id: run.id },
        data: { status: "SKIPPED" },
      })
      skipped++
      continue
    }

    const referral = enrollment.referral
    const body = resolveBody(step.body, referral)

    try {
      if (step.channel === "SMS") {
        if (!referral.patientPhone) {
          await prisma.sequenceStepRun.update({ where: { id: run.id }, data: { status: "SKIPPED" } })
          skipped++
          continue
        }
        await sendSMS(referral.patientPhone, body, referral.id)
      } else {
        // EMAIL
        if (!referral.patientEmail) {
          await prisma.sequenceStepRun.update({ where: { id: run.id }, data: { status: "SKIPPED" } })
          skipped++
          continue
        }
        const subject = step.subject
          ? resolveBody(step.subject, referral)
          : `Message from Genesis Ortho`
        // Body may already be HTML (rich text editor); only wrap plain text.
        const html = /<[a-z][\s\S]*>/i.test(body) ? body : `<p>${body.replace(/\n/g, "<br/>")}</p>`
        const from = await resolveWorkflowSender((step as any).fromSender, null, referral.id)
        await sendEmail(referral.patientEmail, subject, html, {
          ...(from.fromEmail ? { fromEmail: from.fromEmail } : { sender: from.senderKey }),
          attachments: ((step as any).attachments ?? []) as any,
        })
      }

      await prisma.sequenceStepRun.update({
        where: { id: run.id },
        data: { status: "SENT", sentAt: new Date() },
      })
      sent++
    } catch (e: any) {
      await prisma.sequenceStepRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: e?.message ?? "Unknown error" },
      })
      failed++
    }
  }

  // Mark enrollments as COMPLETED when all their step runs are done
  const completedEnrollmentIds = await prisma.sequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      stepRuns: { every: { status: { in: ["SENT", "FAILED", "SKIPPED"] } } },
    },
    select: { id: true },
  })
  if (completedEnrollmentIds.length > 0) {
    await prisma.sequenceEnrollment.updateMany({
      where: { id: { in: completedEnrollmentIds.map((e) => e.id) } },
      data: { status: "COMPLETED" },
    })
  }

  return NextResponse.json({ sent, failed, skipped, completedEnrollments: completedEnrollmentIds.length })
}
