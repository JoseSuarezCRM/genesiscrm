import twilio from "twilio"

// Lazy-initialized to avoid build-time errors when env vars aren't set yet
let _client: ReturnType<typeof twilio> | null = null
function getClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  return _client
}

// Normalize any US phone format to E.164 (+1XXXXXXXXXX)
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return phone // return as-is if we can't normalize (international numbers)
}

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const from = process.env.TWILIO_PHONE_NUMBER!
    await getClient().messages.create({ from, to: toE164(to), body })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[TWILIO]", message)
    return { success: false, error: message }
  }
}
