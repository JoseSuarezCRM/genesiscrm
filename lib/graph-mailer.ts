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

// The from-address for a given sender key (used e.g. as the ICS organizer).
export function senderEmail(sender?: EmailSender): string {
  return SENDER_EMAILS[sender ?? "referrals"]
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

// An attachment: either a file already in Blob storage (url) or inline bytes
// generated on the fly (contentBase64), e.g. a calendar invite (.ics).
export interface EmailAttachment {
  name: string
  contentType: string
  url?: string
  contentBase64?: string
}

// Convert each attachment to a Graph fileAttachment (base64). Inline content is
// used directly; url-backed attachments are fetched from Blob first.
// Graph's simple sendMail supports a total message size up to ~3-4 MB, so this
// is intended for modestly-sized files (PDFs, images, .ics). Larger files skip.
async function buildGraphAttachments(attachments: EmailAttachment[]): Promise<any[]> {
  const out: any[] = []
  // Private Blob store requires the token in the Authorization header to read bytes.
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  for (const att of attachments) {
    try {
      let contentBytes: string
      if (att.contentBase64) {
        contentBytes = att.contentBase64
      } else if (att.url) {
        const res = await fetch(att.url, blobToken ? { headers: { Authorization: `Bearer ${blobToken}` } } : undefined)
        if (!res.ok) { console.error("[GRAPH_MAIL] attachment fetch failed", att.url); continue }
        contentBytes = Buffer.from(await res.arrayBuffer()).toString("base64")
      } else {
        continue
      }
      out.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name,
        contentType: att.contentType || "application/octet-stream",
        contentBytes,
      })
    } catch (e) {
      console.error("[GRAPH_MAIL] attachment error", att.name, e)
    }
  }
  return out
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options?: { cc?: string[]; bcc?: string[]; sender?: EmailSender; fromEmail?: string; attachments?: EmailAttachment[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    // An explicit fromEmail (e.g. a user's own mailbox) overrides the sender key.
    const fromEmail = options?.fromEmail || SENDER_EMAILS[options?.sender ?? "referrals"]
    const token = await getAccessToken()
    const toList = Array.isArray(to) ? to : [to]
    const toRecipients = toList.map(a => ({ emailAddress: { address: a } }))
    const ccRecipients = (options?.cc ?? []).map(a => ({ emailAddress: { address: a } }))
    const bccRecipients = (options?.bcc ?? []).map(a => ({ emailAddress: { address: a } }))
    const attachments = options?.attachments?.length
      ? await buildGraphAttachments(options.attachments)
      : []

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
            ...(attachments.length ? { attachments } : {}),
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

// RFC 2047 encoded-word so non-ASCII subjects are safe in a MIME header.
function encodeHeaderWord(s: string): string {
  return /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`
}

// base64 body wrapped at 76 chars per MIME.
function b64Wrapped(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n")
}

// Send a real calendar meeting request (iTIP). Unlike attaching the .ics, this
// puts the calendar as a `text/calendar; method=REQUEST` alternative body inside
// a raw MIME message, so Outlook/Gmail render it as an invite (Accept/Decline)
// and auto-add it. Uses Graph's MIME sendMail — only needs Mail.Send.
export async function sendCalendarInvite(
  to: string[],
  subject: string,
  html: string,
  ics: string,
  sender?: EmailSender,
  fromEmail?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const from = fromEmail || SENDER_EMAILS[sender ?? "referrals"]
    const token = await getAccessToken()
    const boundary = "gomtg" + Math.random().toString(36).slice(2)
    const mime = [
      "MIME-Version: 1.0",
      `Date: ${new Date().toUTCString()}`,
      `From: Genesis Ortho <${from}>`,
      `To: ${to.join(", ")}`,
      `Subject: ${encodeHeaderWord(subject)}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: text/html; charset="utf-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64Wrapped(html),
      "",
      `--${boundary}`,
      `Content-Type: text/calendar; charset="utf-8"; method=REQUEST`,
      "Content-Transfer-Encoding: base64",
      "",
      b64Wrapped(ics),
      "",
      `--${boundary}--`,
      "",
    ].join("\r\n")

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
        body: Buffer.from(mime, "utf8").toString("base64"),
      },
    )
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      const msg = `Graph MIME sendMail HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`
      console.error("[GRAPH_MAIL] invite", msg)
      return { success: false, error: msg }
    }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[GRAPH_MAIL] invite", message)
    return { success: false, error: message }
  }
}
