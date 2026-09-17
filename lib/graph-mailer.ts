/**
 * Microsoft Graph API email sender (OAuth2 client credentials).
 * Single Azure App Registration with Mail.Send permission on all three mailboxes.
 * Env vars: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET
 *           MS_FROM_EMAIL          (referrals sender, default)
 *           MS_SURGERY_FROM_EMAIL  (surgery sender)
 *           MS_TPL_FROM_EMAIL      (TPL sender)
 */

import { absolutizeMediaUrls } from "@/lib/media-url"
import { withSignature } from "@/lib/email-signature"
import { listSharedMailboxes, senderEmailFor } from "@/lib/shared-mailboxes"

// A saved sender value: one of the original three keys, or any shared mailbox
// address. Kept loose because the set of mailboxes is data now (SharedMailbox),
// not a fixed union — see lib/shared-mailboxes.ts.
export type EmailSender = string

// The sender options, read from the SharedMailbox table.
export async function emailSenderOptions(): Promise<{ value: string; label: string }[]> {
  const boxes = await listSharedMailboxes()
  return boxes.map((m) => ({ value: m.legacyKey ?? m.email, label: m.email }))
}

// The from-address for a saved sender value (used e.g. as the ICS organizer).
export async function senderEmail(sender?: EmailSender): Promise<string> {
  return senderEmailFor(sender)
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
  /**
   * Embed in the message body rather than listing it as a file to download —
   * the mechanism Outlook uses for signature logos. The body references it as
   * `<img src="cid:<contentId>">`, and the two strings must match exactly.
   */
  isInline?: boolean
  contentId?: string
}

// Graph's simple sendMail carries a whole message in one request, and Microsoft
// caps that at ~4 MB. Anything at or above this goes through an upload session
// against a draft instead (see sendViaDraft).
const INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024

// Upload-session slices must be a multiple of 320 KiB; 4 MB is the documented max.
const UPLOAD_SLICE = 320 * 1024 * 10 // 3.2 MB

/** Read an attachment's bytes, whether it's inline base64 or a private Blob URL. */
async function attachmentBytes(att: EmailAttachment): Promise<Buffer | null> {
  try {
    if (att.contentBase64) return Buffer.from(att.contentBase64, "base64")
    if (!att.url) return null
    // The private Blob store needs the token in the Authorization header.
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    const res = await fetch(att.url, blobToken ? { headers: { Authorization: `Bearer ${blobToken}` } } : undefined)
    if (!res.ok) { console.error("[GRAPH_MAIL] attachment fetch failed", att.url, res.status); return null }
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.error("[GRAPH_MAIL] attachment error", att.name, e)
    return null
  }
}

// Convert each attachment to a Graph fileAttachment (base64), fetching url-backed
// ones from Blob first. Files too big to ride inline are reported back rather
// than dropped quietly — the caller decides what to say about them.
async function buildGraphAttachments(
  attachments: EmailAttachment[],
): Promise<{ inline: any[]; large: { att: EmailAttachment; bytes: Buffer }[]; failed: string[] }> {
  const inline: any[] = []
  const large: { att: EmailAttachment; bytes: Buffer }[] = []
  const failed: string[] = []
  for (const att of attachments) {
    const bytes = await attachmentBytes(att)
    if (!bytes) { failed.push(att.name); continue }
    const entry = {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.name,
      contentType: att.contentType || "application/octet-stream",
      contentBytes: bytes.toString("base64"),
      ...(att.isInline ? { isInline: true, contentId: att.contentId ?? att.name } : {}),
    }
    // An embedded image belongs in the body no matter its size — routing it
    // through an upload session would detach it from the cid: it's referenced by.
    if (bytes.length >= INLINE_ATTACHMENT_LIMIT && !att.isInline) large.push({ att, bytes })
    else inline.push(entry)
  }
  return { inline, large, failed }
}

/**
 * Upload one large attachment into an existing draft, in slices.
 *
 * Graph only accepts a file this size through an upload session, and a session
 * only exists against a draft message — which is why the large-attachment paths
 * all go draft-first. Returns false rather than throwing so one bad file doesn't
 * lose the whole message.
 */
async function uploadLargeAttachment(
  base: string, draftId: string, token: string, att: EmailAttachment, bytes: Buffer,
): Promise<boolean> {
  try {
    const sessionRes = await fetch(`${base}/messages/${draftId}/attachments/createUploadSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        AttachmentItem: {
          attachmentType: "file",
          name: att.name,
          size: bytes.length,
          contentType: att.contentType || "application/octet-stream",
        },
      }),
    })
    if (!sessionRes.ok) {
      console.error("[GRAPH_MAIL] upload session failed", att.name, (await sessionRes.text()).slice(0, 200))
      return false
    }
    const { uploadUrl } = await sessionRes.json() as { uploadUrl: string }

    for (let start = 0; start < bytes.length; start += UPLOAD_SLICE) {
      const end = Math.min(start + UPLOAD_SLICE, bytes.length) - 1
      const slice = bytes.subarray(start, end + 1)
      // The upload URL carries its own auth — adding ours is rejected. Buffer
      // isn't a BodyInit, so hand over the underlying bytes.
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(slice.length),
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        },
        body: new Uint8Array(slice),
      })
      if (!put.ok && put.status !== 200 && put.status !== 201) {
        console.error("[GRAPH_MAIL] slice upload failed", att.name, put.status)
        return false
      }
    }
    return true
  } catch (e) {
    console.error("[GRAPH_MAIL] upload error", att.name, e)
    return false
  }
}

/**
 * Send with at least one attachment too large for a single sendMail call.
 *
 * Creates a draft, uploads the big files into it, then sends. Needs
 * **Mail.ReadWrite**, where the plain path needs only Mail.Send; if that grant is
 * missing the draft POST fails and the caller falls back, minus those files.
 */
async function sendViaDraft(
  fromEmail: string,
  message: Record<string, unknown>,
  inline: any[],
  large: { att: EmailAttachment; bytes: Buffer }[],
): Promise<{ success: boolean; error?: string }> {
  const token = await getAccessToken()
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}`
  const auth = { Authorization: `Bearer ${token}` }

  const draftRes = await fetch(`${base}/messages`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, ...(inline.length ? { attachments: inline } : {}) }),
  })
  if (!draftRes.ok) {
    return { success: false, error: `Draft failed: ${(await draftRes.text()).slice(0, 200)}` }
  }
  const draft = await draftRes.json() as { id: string }

  for (const { att, bytes } of large) {
    if (await uploadLargeAttachment(base, draft.id, token, att, bytes)) continue
    // Abandon the half-built draft so it doesn't linger in the sender's Drafts,
    // and let the caller fall back to a send without these files.
    await fetch(`${base}/messages/${draft.id}`, { method: "DELETE", headers: auth }).catch(() => {})
    return { success: false, error: `Could not upload ${att.name}` }
  }

  const sendRes = await fetch(`${base}/messages/${draft.id}/send`, { method: "POST", headers: auth })
  if (!sendRes.ok && sendRes.status !== 202) {
    return { success: false, error: `Send failed: ${(await sendRes.text()).slice(0, 200)}` }
  }
  return { success: true }
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  options?: { cc?: string[]; bcc?: string[]; sender?: EmailSender; fromEmail?: string; attachments?: EmailAttachment[]; signature?: false }
): Promise<{ success: boolean; error?: string; skippedAttachments?: string[] }> {
  try {
    // An explicit fromEmail (e.g. a user's own mailbox) overrides the sender key.
    const fromEmail = options?.fromEmail || (await senderEmailFor(options?.sender))
    // Signature first: it may carry a logo, and the absolutize pass below has to
    // see it too or that image arrives broken.
    // Signature first: its images become inline cid: attachments, and the
    // absolutize pass below must not turn those back into URLs.
    let signatureAttachments: EmailAttachment[] = []
    if (options?.signature !== false) {
      const sig = await withSignature(html, fromEmail)
      html = sig.html
      signatureAttachments = sig.inlineAttachments
    }
    // Recipients can't resolve relative /api/media/<id> image srcs — make absolute.
    html = absolutizeMediaUrls(html)
    const token = await getAccessToken()
    const toList = Array.isArray(to) ? to : [to]
    const toRecipients = toList.map(a => ({ emailAddress: { address: a } }))
    const ccRecipients = (options?.cc ?? []).map(a => ({ emailAddress: { address: a } }))
    const bccRecipients = (options?.bcc ?? []).map(a => ({ emailAddress: { address: a } }))
    const allAttachments = [...(options?.attachments ?? []), ...signatureAttachments]
    const built = allAttachments.length
      ? await buildGraphAttachments(allAttachments)
      : { inline: [], large: [], failed: [] }
    const attachments = built.inline
    const skipped: string[] = [...built.failed]

    const message = {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients,
      ...(ccRecipients.length ? { ccRecipients } : {}),
      ...(bccRecipients.length ? { bccRecipients } : {}),
      from: { emailAddress: { address: fromEmail, name: "Genesis Ortho" } },
    }

    // Anything over the inline ceiling can only go via a draft + upload session.
    if (built.large.length) {
      const viaDraft = await sendViaDraft(fromEmail, message, attachments, built.large)
      if (viaDraft.success) return { success: true, skippedAttachments: skipped.length ? skipped : undefined }
      // The draft path needs Mail.ReadWrite. Rather than fail the whole send when
      // that grant is missing, send what fits and report what didn't.
      console.error("[GRAPH_MAIL] large-attachment send failed, falling back:", viaDraft.error)
      skipped.push(...built.large.map((l) => l.att.name))
    }

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: { ...message, ...(attachments.length ? { attachments } : {}) },
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

    return { success: true, skippedAttachments: skipped.length ? skipped : undefined }
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
    const from = fromEmail || (await senderEmailFor(sender))
    // The invite body is signed too — it's a person-to-person message with an
    // .ics rider, not a system notification. Images stay as URLs: this path
    // hand-builds a MIME message with no place to put inline attachments.
    const invSig = await withSignature(html, from, { embedImages: false })
    html = absolutizeMediaUrls(invSig.html)
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

// ── Inbound: read replies from a mailbox ─────────────────────────────────────
// Needs the app registration to have Mail.Read (application) granted with admin
// consent — the same client-credentials token is reused.
export interface InboundMessage {
  id: string
  internetMessageId: string
  conversationId: string | null
  fromEmail: string | null
  fromName: string | null
  toRecipients: string[]
  subject: string
  bodyHtml: string
  receivedAt: string
}

export async function fetchInboundMessages(mailbox: string, sinceIso: string): Promise<InboundMessage[]> {
  const token = await getAccessToken()
  // Inbox only, received since `sinceIso`, newest first.
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`
    + `?$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}`
    + `&$select=id,internetMessageId,conversationId,from,toRecipients,subject,body,receivedDateTime`
    + `&$top=50&$orderby=receivedDateTime desc`

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text()
    // 403 = Mail.Read not granted yet; surface quietly.
    throw new Error(`Graph read failed for ${mailbox}: ${res.status} ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { value: any[] }
  return (data.value ?? []).map((m) => ({
    id: m.id,
    internetMessageId: m.internetMessageId,
    conversationId: m.conversationId ?? null,
    fromEmail: m.from?.emailAddress?.address?.toLowerCase() ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    toRecipients: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address?.toLowerCase()).filter(Boolean),
    subject: m.subject ?? "(no subject)",
    bodyHtml: m.body?.content ?? "",
    receivedAt: m.receivedDateTime,
  }))
}

// ── Threaded send + reply ────────────────────────────────────────────────────
// Create a draft then send it, so we capture the conversationId / message ids and
// can later match replies and reply in-thread. Needs Mail.ReadWrite + Mail.Send.
export async function sendEmailTracked(fromEmail: string, to: string, subject: string, html: string, options?: { cc?: string[]; bcc?: string[]; attachments?: EmailAttachment[]; signature?: false }): Promise<{
  success: boolean; error?: string; conversationId?: string; internetMessageId?: string; graphMessageId?: string
  skippedAttachments?: string[]
}> {
  try {
    let signatureAttachments: EmailAttachment[] = []
    if (options?.signature !== false) {
      const sig = await withSignature(html, fromEmail)
      html = sig.html
      signatureAttachments = sig.inlineAttachments
    }
    html = absolutizeMediaUrls(html)
    const token = await getAccessToken()
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}`
    const ccRecipients = (options?.cc ?? []).map((a) => ({ emailAddress: { address: a } }))
    const bccRecipients = (options?.bcc ?? []).map((a) => ({ emailAddress: { address: a } }))
    const allAttachments = [...(options?.attachments ?? []), ...signatureAttachments]
    const built = allAttachments.length
      ? await buildGraphAttachments(allAttachments)
      : { inline: [], large: [], failed: [] }
    const attachments = built.inline
    // This path already builds a draft, so large files upload into that draft
    // directly rather than needing a second one.
    const skipped: string[] = [...built.failed]
    // 1) Create the draft — the response carries the ids we need.
    const draftRes = await fetch(`${base}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        ...(ccRecipients.length ? { ccRecipients } : {}),
        ...(bccRecipients.length ? { bccRecipients } : {}),
        ...(attachments.length ? { attachments } : {}),
        from: { emailAddress: { address: fromEmail, name: "Genesis Ortho" } },
      }),
    })
    if (!draftRes.ok) return { success: false, error: `Draft failed: ${(await draftRes.text()).slice(0, 200)}` }
    const draft = await draftRes.json() as { id: string; conversationId?: string; internetMessageId?: string }

    // 2) Upload anything too big to have ridden inline. A file that fails here is
    // reported, not fatal — the rest of the message is already composed.
    for (const { att, bytes } of built.large) {
      const ok = await uploadLargeAttachment(base, draft.id, token, att, bytes)
      if (!ok) skipped.push(att.name)
    }

    // 3) Send the draft.
    const sendRes = await fetch(`${base}/messages/${draft.id}/send`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
    if (!sendRes.ok && sendRes.status !== 202) return { success: false, error: `Send failed: ${(await sendRes.text()).slice(0, 200)}` }
    return {
      success: true, conversationId: draft.conversationId, internetMessageId: draft.internetMessageId,
      graphMessageId: draft.id, skippedAttachments: skipped.length ? skipped : undefined,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Reply to a message, keeping it in the same thread (sends immediately).
export async function replyToMessage(mailbox: string, graphMessageId: string, html: string, options?: { signature?: false }): Promise<{ success: boolean; error?: string }> {
  try {
    // Outlook signs replies too, so a thread reads the same whether it was
    // answered from the CRM or from someone's inbox.
    let signatureAttachments: EmailAttachment[] = []
    if (options?.signature !== false) {
      const sig = await withSignature(html, mailbox)
      html = sig.html
      signatureAttachments = sig.inlineAttachments
    }
    html = absolutizeMediaUrls(html)
    const token = await getAccessToken()
    const built = signatureAttachments.length
      ? await buildGraphAttachments(signatureAttachments)
      : { inline: [], large: [], failed: [] }
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages/${graphMessageId}/reply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          body: { contentType: "HTML", content: html },
          ...(built.inline.length ? { attachments: built.inline } : {}),
        },
      }),
    })
    if (!res.ok && res.status !== 202) return { success: false, error: `Reply failed: ${(await res.text()).slice(0, 200)}` }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
