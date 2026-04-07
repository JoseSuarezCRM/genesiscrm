import { NextResponse } from "next/server"
import { runScheduledTriggers } from "@/lib/automation-engine"

// Vercel Cron — runs daily at 8am UTC
// Schedule configured in vercel.json
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await runScheduledTriggers()
  return NextResponse.json({ ok: true })
}
