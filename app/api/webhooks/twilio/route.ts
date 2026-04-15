import { NextRequest, NextResponse } from "next/server"
import twilio from "twilio"
import { prisma } from "@/lib/prisma"

// Twilio sends application/x-www-form-urlencoded
export async function POST(req: NextRequest) {
  try {
    // ── Validate Twilio signature ──────────────────────────────────────────
    const signature = req.headers.get("x-twilio-signature") ?? ""
    const url = `${process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/webhooks/twilio`

    const body = await req.text()
    const params = Object.fromEntries(new URLSearchParams(body))

    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      url,
      params
    )

    // In development without a real URL, skip strict validation
    if (!isValid && process.env.NODE_ENV === "production") {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const from: string = params.From ?? ""
    const messageBody: string = params.Body ?? ""
    const twilioSid: string = params.MessageSid ?? ""

    if (!from || !messageBody) {
      return new NextResponse("Bad Request", { status: 400 })
    }

    // ── Find or create thread by phone number ──────────────────────────────
    let thread = await prisma.smsThread.findFirst({ where: { phone: from } })

    if (!thread) {
      thread = await prisma.smsThread.create({
        data: {
          phone: from,
          contactName: null,
        },
      })
    }

    // ── Save inbound message ───────────────────────────────────────────────
    await prisma.$transaction([
      prisma.smsMessage.create({
        data: {
          threadId: thread.id,
          body: messageBody,
          direction: "INBOUND",
          status: "received",
          twilioSid,
        },
      }),
      prisma.smsThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
        },
      }),
    ])

    // Return empty TwiML — no auto-reply
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  } catch (e) {
    console.error("[twilio webhook]", e)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
