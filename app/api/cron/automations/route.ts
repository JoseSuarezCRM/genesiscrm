import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { runScheduledTriggers } from "@/lib/automation-engine"

// Vercel Cron — runs daily at 8am UTC
// Schedule configured in vercel.json
export async function GET(req: Request) {
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr

  await runScheduledTriggers()
  return NextResponse.json({ ok: true })
}
