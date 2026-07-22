import { NextRequest, NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { triggerAutoOutreach } from "@/app/actions/outreach"
import { OutreachTrigger } from "@prisma/client"

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron (or manual trigger with secret)
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr

  const now = new Date()
  const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000)

  // Find referrals with appointments in the next 23-25 hours
  // that haven't already received a 24hr reminder
  const referrals = await prisma.referral.findMany({
    where: {
      status: "SCHEDULED",
      appointmentDate: {
        gte: in23Hours,
        lte: in25Hours,
      },
      outreachMessages: {
        none: { trigger: OutreachTrigger.REMINDER_24HR },
      },
    },
    select: { id: true },
  })

  for (const referral of referrals) {
    await triggerAutoOutreach(referral.id, OutreachTrigger.REMINDER_24HR)
  }

  return NextResponse.json({ sent: referrals.length })
}
