import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { pollInboundEmails } from "@/lib/inbound-email"

// Vercel Cron — polls connected mailboxes for email replies. Schedule in vercel.json.
export async function GET(req: Request) {
  const _cronErr = assertCron(req)
  if (_cronErr) return _cronErr
  const result = await pollInboundEmails()
  return NextResponse.json({ ok: true, ...result })
}
