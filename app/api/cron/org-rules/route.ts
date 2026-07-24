import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { runOrgRulesPollerIfDue } from "@/lib/org-rules-merge"

// Vercel Cron — checks every 15 min and re-applies the org name rules to
// existing practices when the poller is enabled and its interval has elapsed.
// Schedule configured in vercel.json.
export async function GET(req: Request) {
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr

  const result = await runOrgRulesPollerIfDue()
  return NextResponse.json({ ok: true, ...result })
}
