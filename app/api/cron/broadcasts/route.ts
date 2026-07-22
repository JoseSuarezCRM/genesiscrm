import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { sendScheduledBroadcasts } from "@/app/actions/broadcasts"

// Vercel Cron — runs every 15 minutes
// Schedule configured in vercel.json
export async function GET(req: Request) {
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr

  await sendScheduledBroadcasts()
  return NextResponse.json({ ok: true })
}
