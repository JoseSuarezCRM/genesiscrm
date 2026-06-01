import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/graph-mailer"
import { sendSMS, toE164 } from "@/lib/twilio"

function resolveBody(template: string, referral: {
  patientFirstName: string
  patientLastName: string
  referringDoctorName?: string | null
  referringPractice?: { name: string } | null
}): string {
  return template
    .replace(/\{patient_first_name\}/g, referral.patientFirstName)
    .replace(/\{patient_name\}/g, `${referral.patientFirstName} ${referral.patientLastName}`)
    .replace(/\{provider_name\}/g, referral.referringDoctorName ?? "your provider")
    .replace(/\{practice_name\}/g, referral.referringPractice?.name ?? "the referring practice")
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
              patientFirstName: true,
              patientLastName: true,
              patientPhone: true,
              patientEmail: true,
              referringDoctorName: true,
              referringPractice: { select: { name: true } },
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
        await sendEmail(referral.patientEmail, subject, `<p>${body.replace(/\n/g, "<br/>")}</p>`)
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
