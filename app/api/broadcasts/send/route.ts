import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendBroadcastEmails } from "@/app/actions/broadcasts"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { broadcastId } = await req.json()
  if (!broadcastId) return NextResponse.json({ error: "Missing broadcastId" }, { status: 400 })

  await sendBroadcastEmails(broadcastId)
  return NextResponse.json({ ok: true })
}
