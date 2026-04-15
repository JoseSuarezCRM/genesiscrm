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
    const body   = await req.text()
    const params = Object.fromEntries(new URLSearchParams(body))

    // ── Signature validation ───────────────────────────────────────────────
    // Use the actual host the request arrived on — VERCEL_URL is the
    // deployment-specific subdomain and won't match a custom domain.
    const signature = req.headers.get("x-twilio-signature") ?? ""
    const host      = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
    const webhookUrl = `https://${host}/api/webhooks/twilio`

    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      webhookUrl,
      params
    )

    if (!isValid && process.env.NODE_ENV === "production") {
      console.error("[twilio webhook] Invalid signature. URL used:", webhookUrl)
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
      const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
      const sent   = await client.messages.create({
        body: matched.response,
        from: process.env.TWILIO_PHONE!,
        to:   from,
      })

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
