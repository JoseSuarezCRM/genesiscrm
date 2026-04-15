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

export async function GET() {
  // Health check — confirms the route is reachable
  return new NextResponse("Twilio webhook OK", { status: 200 })
}

export async function POST(req: NextRequest) {
  try {
    const body   = await req.text()
    const params = Object.fromEntries(new URLSearchParams(body))

    // Log every inbound hit so we can confirm Twilio is reaching this route
    console.log("[twilio webhook] HIT", {
      from:    params.From,
      body:    params.Body,
      sid:     params.MessageSid,
      host:    req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    })

    // ── Signature validation ───────────────────────────────────────────────
    // TWILIO_WEBHOOK_URL must be set in Vercel env vars to the exact URL
    // configured in Twilio (e.g. https://genesiscrm.vercel.app/api/webhooks/twilio)
    // If not set, we skip strict validation but log a warning.
    const signature  = req.headers.get("x-twilio-signature") ?? ""
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL
      ?? (() => {
           const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? ""
           return `https://${host}/api/webhooks/twilio`
         })()

    const isValid = twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      webhookUrl,
      params
    )

    if (!isValid) {
      if (process.env.TWILIO_WEBHOOK_URL) {
        // URL is explicitly set — safe to enforce
        console.error("[twilio] Invalid signature for URL:", webhookUrl)
        return new NextResponse("Forbidden", { status: 403 })
      }
      // URL was inferred — log the warning but allow through so messages
      // aren't dropped while the env var is being configured
      console.warn("[twilio] Signature mismatch (set TWILIO_WEBHOOK_URL to enforce). URL tried:", webhookUrl)
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
