/**
 * Microsoft Graph API email sender (OAuth2 client credentials).
 * Requires an Azure App Registration with Mail.Send application permission.
 * Env vars: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_FROM_EMAIL
 */

const FROM_EMAIL = process.env.MS_FROM_EMAIL ?? "Referrals@genesisortho.com"

// Simple in-process token cache — reuses the token until 60s before expiry
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
  options?: { cc?: string[]; bcc?: string[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getAccessToken()
    const toList = Array.isArray(to) ? to : [to]
    const toRecipients = toList.map(a => ({ emailAddress: { address: a } }))
    const ccRecipients = (options?.cc ?? []).map(a => ({ emailAddress: { address: a } }))
    const bccRecipients = (options?.bcc ?? []).map(a => ({ emailAddress: { address: a } }))

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(FROM_EMAIL)}/sendMail`,
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
            from: { emailAddress: { address: FROM_EMAIL, name: "Genesis Ortho CRM" } },
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
