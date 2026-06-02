/**
 * Microsoft Graph API email sender (OAuth2 client credentials).
 * Single Azure App Registration with Mail.Send permission on all three mailboxes.
 * Env vars: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
 *           MS_FROM_EMAIL          (referrals sender, default)
 *           MS_SURGERY_FROM_EMAIL  (surgery sender)
 *           MS_TPL_FROM_EMAIL      (TPL sender)
 */

export type EmailSender = "referrals" | "surgery" | "tpl"

export const EMAIL_SENDER_OPTIONS: { value: EmailSender; label: string }[] = [
  { value: "referrals", label: "Referrals@genesisortho.com" },
  { value: "surgery",   label: "surgery@genesisortho.com" },
  { value: "tpl",       label: "tpl@genesisortho.com" },
]

const SENDER_EMAILS: Record<EmailSender, string> = {
  referrals: process.env.MS_FROM_EMAIL          ?? "Referrals@genesisortho.com",
  surgery:   process.env.MS_SURGERY_FROM_EMAIL  ?? "surgery@genesisortho.com",
  tpl:       process.env.MS_TPL_FROM_EMAIL      ?? "tpl@genesisortho.com",
}

// Single token cache — same Azure app for all three mailboxes
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  const tenantId = process.env.MS_TENANT_ID
  const clientId = process.env.MS_CLIENT_ID
  const clientSecret = process.env.MS_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph email is not configured (missing MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET)")
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Token request failed: ${body}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options?: { cc?: string[]; bcc?: string[]; sender?: EmailSender }
): Promise<{ success: boolean; error?: string }> {
  try {
    const fromEmail = SENDER_EMAILS[options?.sender ?? "referrals"]
    const token = await getAccessToken()
    const toList = Array.isArray(to) ? to : [to]
    const toRecipients = toList.map(a => ({ emailAddress: { address: a } }))
    const ccRecipients = (options?.cc ?? []).map(a => ({ emailAddress: { address: a } }))
    const bccRecipients = (options?.bcc ?? []).map(a => ({ emailAddress: { address: a } }))

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "HTML", content: html },
            toRecipients,
            ...(ccRecipients.length ? { ccRecipients } : {}),
            ...(bccRecipients.length ? { bccRecipients } : {}),
            from: { emailAddress: { address: fromEmail, name: "Genesis Ortho" } },
          },
          saveToSentItems: true,
        }),
      }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = (body as any)?.error?.message ?? `HTTP ${res.status}`
      console.error("[GRAPH_MAIL]", msg)
      return { success: false, error: msg }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[GRAPH_MAIL]", message)
    return { success: false, error: message }
  }
}
