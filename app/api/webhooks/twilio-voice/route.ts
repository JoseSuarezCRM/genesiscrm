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
  // Escape XML special chars
  return `<Say voice="alice">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Say>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = Object.fromEntries(new URLSearchParams(body))

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === "production") {
      const signature = req.headers.get("x-twilio-signature") ?? ""
      const url = `https://${process.env.VERCEL_URL ?? req.headers.get("host")}/api/webhooks/twilio-voice`
      const valid = twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN!,
        signature,
        url,
        params
      )
      if (!valid) return new NextResponse("Forbidden", { status: 403 })
    }

    const config = await prisma.ivrConfig.findFirst({
      include: { options: { orderBy: { order: "asc" } } },
    })

    // IVR is off or not configured — just say a default message
    if (!config || !config.isActive || config.options.length === 0) {
      return twiml(`${say("Thank you for calling Genesis Ortho. Please call back during business hours.")}<Hangup/>`)
    }

    // Build the menu prompt from options
    const optionLines = config.options
      .map((o) => `Press ${o.digit} ${o.label}.`)
      .join(" ")

    const menuText = `${config.greeting} ${optionLines}`

    const gatherUrl = `/api/webhooks/twilio-voice/gather`

    return twiml(
      `<Gather numDigits="1" action="${gatherUrl}" method="POST" timeout="${config.gatherTimeout}">` +
        say(menuText) +
      `</Gather>` +
      say(config.noInputMessage) +
      `<Hangup/>`
    )
  } catch (e) {
    console.error("[twilio-voice]", e)
    return twiml(`${say("We're sorry, an error occurred. Please try again later.")}<Hangup/>`)
  }
}
