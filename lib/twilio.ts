import twilio from "twilio"

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER!

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await twilioClient.messages.create({ from: TWILIO_FROM, to, body })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[TWILIO]", message)
    return { success: false, error: message }
  }
}
