import { Resend } from "resend"

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? ""

// Lazy-initialized to avoid build-time errors when env var isn't set yet
let _client: Resend | null = null
function getClient(): Resend {
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY!)
  return _client
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await getClient().emails.send({ from: FROM_EMAIL, to, subject, html })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[RESEND]", message)
    return { success: false, error: message }
  }
}
