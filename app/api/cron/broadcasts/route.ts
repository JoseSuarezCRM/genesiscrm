import { NextResponse } from "next/server"
import { sendScheduledBroadcasts } from "@/app/actions/broadcasts"

// Vercel Cron — runs every 15 minutes
// Schedule configured in vercel.json
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await sendScheduledBroadcasts()
  return NextResponse.json({ ok: true })
}
