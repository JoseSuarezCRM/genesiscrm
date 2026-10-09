import { NextResponse } from "next/server"
import { assertCron } from "@/lib/cron-auth"
import { purgeExpired, RETENTION_DAYS } from "@/lib/genesis-ai/conversation"

/**
 * Daily: delete Genesis AI chats nobody has touched in RETENTION_DAYS (30). They
 * hold patient details, so they're kept only as long as they're useful to the
 * person who had them (user's decision, 2026-10-08).
 */
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  const denied = assertCron(req)
  if (denied) return denied
  const deleted = await purgeExpired()
  return NextResponse.json({ ok: true, retentionDays: RETENTION_DAYS, deleted })
}
