import { NextRequest, NextResponse } from "next/server"
import twilio from "twilio"
import { prisma } from "@/lib/prisma"

function matchesRule(body: string, trigger: string, matchType: string): boolean {
  const text = body.trim().toLowerCase()
  const kw   = trigger.trim().toLowerCase()
  switch (matchType) {
    case "contains":     return text.includes(kw)
    case "starts_with":  return text.startsWith(kw)
    case "exact":
    default:             return text === kw
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── Validate Twilio signature ──────────────────────────────────────────
    const signature = req.headers.get("x-twilio-signature") ?? ""
    const url = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/webhooks/twilio`

    const body = await req.text()
    const params = Object.fromEntries(new URLSearchParams(body))

    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      url,
      params
    )

    if (!isValid && process.env.NODE_ENV === "production") {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const from: string        = params.From ?? ""
    const messageBody: string = params.Body ?? ""
    const twilioSid: string   = params.MessageSid ?? ""

    if (!from || !messageBody) {
      return new NextResponse("Bad Request", { status: 400 })
    }

    // ── Find or create thread ──────────────────────────────────────────────
    let thread = await prisma.smsThread.findFirst({ where: { phone: from } })
    if (!thread) {
      thread = await prisma.smsThread.create({ data: { phone: from } })
    }

    // ── Save inbound message ───────────────────────────────────────────────
    await prisma.$transaction([
      prisma.smsMessage.create({
        data: {
          threadId:  thread.id,
          body:      messageBody,
          direction: "INBOUND",
          status:    "received",
          twilioSid,
        },
      }),
      prisma.smsThread.update({
        where: { id: thread.id },
        data:  { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
      }),
    ])

    // ── Check SMS auto-response rules ──────────────────────────────────────
    const rules = await prisma.smsAutoResponse.findMany({
      where:   { isActive: true },
      orderBy: { order: "asc" },
    })

    const matched = rules.find((r) => matchesRule(messageBody, r.trigger, r.matchType))

    if (matched) {
      // Send auto-reply via Twilio
      const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
      const sent = await client.messages.create({
        body: matched.response,
        from: process.env.TWILIO_PHONE!,
        to:   from,
      })

      // Save auto-reply as outbound message in thread
      await prisma.$transaction([
        prisma.smsMessage.create({
          data: {
            threadId:  thread.id,
            body:      matched.response,
            direction: "OUTBOUND",
            status:    sent.status,
            twilioSid: sent.sid,
          },
        }),
        prisma.smsThread.update({
          where: { id: thread.id },
          data:  { lastMessageAt: new Date() },
        }),
      ])
    }

    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml" } }
    )
  } catch (e) {
    console.error("[twilio webhook]", e)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
