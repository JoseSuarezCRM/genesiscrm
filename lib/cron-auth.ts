import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

// Verify a Vercel Cron / caller bearer token. Fails CLOSED when CRON_SECRET is
// unset (so a missing env var can't be bypassed with "Bearer undefined"), and
// uses a constant-time comparison. Returns a 401 response to short-circuit, or
// null when the request is authorized.
export function assertCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const header = req.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  const ok = a.length === b.length && timingSafeEqual(a, b)
  return ok ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
