import { NextRequest, NextResponse } from "next/server"
import twilio from "twilio"
import { prisma } from "@/lib/prisma"

function twiml(xml: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } }
  )
}

function say(text: string) {
  return `<Say voice="alice">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Say>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = Object.fromEntries(new URLSearchParams(body))
    const digit = params.Digits ?? ""

    const config = await prisma.ivrConfig.findFirst({
      include: { options: { orderBy: { order: "asc" } } },
    })

    if (!config) return twiml(`${say("Configuration not found. Goodbye.")}<Hangup/>`)

    const option = config.options.find((o) => o.digit === digit)

    if (!option) {
      // Invalid digit — re-read menu
      const optionLines = config.options.map((o) => `Press ${o.digit} ${o.label}.`).join(" ")
      return twiml(
        `${say(config.invalidMessage)}` +
        `<Gather numDigits="1" action="/api/webhooks/twilio-voice/gather" method="POST" timeout="${config.gatherTimeout}">` +
          say(optionLines) +
        `</Gather>` +
        `${say(config.noInputMessage)}<Hangup/>`
      )
    }

    switch (option.action) {
      case "PLAY_MESSAGE":
        return twiml(`${say(option.message ?? "Thank you. Goodbye.")}<Hangup/>`)

      case "FORWARD_CALL":
        if (!option.forwardTo) return twiml(`${say("Forwarding is not configured. Goodbye.")}<Hangup/>`)
        return twiml(`${say("Please hold while we connect you.")}<Dial>${option.forwardTo}</Dial>`)

      case "HANG_UP":
        return twiml(`${say(option.message ?? "Thank you for calling. Goodbye.")}<Hangup/>`)

      default:
        return twiml(`${say("Thank you. Goodbye.")}<Hangup/>`)
    }
  } catch (e) {
    console.error("[twilio-voice/gather]", e)
    return twiml(`${say("An error occurred. Goodbye.")}<Hangup/>`)
  }
}
