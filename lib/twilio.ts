import twilio from "twilio"
import { prisma } from "@/lib/prisma"

let _client: ReturnType<typeof twilio> | null = null
function getClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  return _client
}

export function toE164(phone: string): string {
  const trimmed = (phone ?? "").trim()
  // Already international (e.g. "+52 644 102 2881"): keep the country code, just
  // strip spaces/formatting so Twilio gets a clean E.164 number.
  if (trimmed.startsWith("+")) return "+" + trimmed.replace(/\D/g, "")
  const digits = trimmed.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return trimmed
}

export async function sendSMS(
  to: string,
  body: string,
  referralId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const from = (process.env.TWILIO_PHONE_NUMBER ?? process.env.TWILIO_PHONE)!
    const toNormalized = toE164(to)
    const msg = await getClient().messages.create({ from, to: toNormalized, body })

    // Find or create a thread and store the outbound message so it appears in the inbox
    await prisma.$transaction(async (tx) => {
      let thread = await tx.smsThread.findFirst({ where: { phone: toNormalized } })
      if (!thread) {
        thread = await tx.smsThread.create({
          data: {
            phone: toNormalized,
            referralId: referralId ?? null,
            lastMessageAt: new Date(),
          },
        })
      } else {
        await tx.smsThread.update({
          where: { id: thread.id },
          data: {
            lastMessageAt: new Date(),
            ...(referralId && !thread.referralId ? { referralId } : {}),
          },
        })
      }
      await tx.smsMessage.create({
        data: {
          threadId: thread.id,
          body,
          direction: "OUTBOUND",
          status: msg.status,
          twilioSid: msg.sid,
        },
      })
    })

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[TWILIO]", message)
    return { success: false, error: message }
  }
}
