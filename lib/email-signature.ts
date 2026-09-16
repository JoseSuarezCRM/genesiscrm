// Which signature goes on an outbound email, and how it's attached.
//
// Outlook signatures can't be read: Microsoft has no Graph API for them — they
// live in the Outlook client, not the mailbox — and Graph's sendMail transmits
// exactly the HTML it's given. So the CRM stores its own.
//
// One rule decides everything, keyed off the from-address:
//
//   shared mailbox  → that mailbox's signature (or the org default if blank)
//   a person        → their personal signature, else the org default
//   anything else   → the org default
//
// That's what lets cron reports, workflow mail and invites work with no special
// casing: they send from a shared mailbox and pick up its signature on the way
// past. It also settles the case where someone composes *as* a department —
// from-address is surgery@, so it signs off as Surgery, not as them.
//
// Server-only: imports Prisma.

import { prisma } from "@/lib/prisma"
import { findMailboxByEmail } from "@/lib/shared-mailboxes"
import { mediaIdFromUrl } from "@/lib/media-url"
import type { EmailAttachment } from "@/lib/graph-mailer"

export const ORG_SIGNATURE_ID = "org"

// Sends happen in loops — a sequence run, a broadcast, a report to a list — and
// the signature is the same every time round. Cache briefly per from-address.
const TTL_MS = 60_000
const cache = new Map<string, { at: number; html: string }>()

export function invalidateSignatureCache() {
  cache.clear()
}

async function signatureRow(id: string): Promise<string | null> {
  try {
    const row = await (prisma as any).emailSignature.findUnique({ where: { id } })
    if (!row || !row.enabled) return null
    const html = String(row.html ?? "").trim()
    return html || null
  } catch {
    return null
  }
}

/** The organization default, or "" if none is set. */
export async function orgSignature(): Promise<string> {
  return (await signatureRow(ORG_SIGNATURE_ID)) ?? ""
}

/**
 * The signature for a given from-address. Returns "" when there is none — never
 * throws, because a signature lookup must not be able to stop an email.
 */
export async function signatureForSender(fromEmail: string | null | undefined): Promise<string> {
  const key = (fromEmail ?? "").trim().toLowerCase()
  if (!key) return ""

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.html

  let html = ""
  try {
    const mailbox = await findMailboxByEmail(key)
    if (mailbox) {
      html = (mailbox.signatureHtml ?? "").trim() || (await orgSignature())
    } else {
      const user = await prisma.user.findFirst({
        where: { email: { equals: key, mode: "insensitive" } },
        select: { id: true },
      })
      html = (user ? await signatureRow(user.id) : null) ?? (await orgSignature())
    }
  } catch {
    html = ""
  }

  cache.set(key, { at: Date.now(), html })
  return html
}

/**
 * Attach a signature to a message body. Separated by a rule so it reads as a
 * sign-off rather than more of the message, and wrapped in the same base font
 * the send paths use so it doesn't inherit whatever the body ended with.
 */
export function appendSignature(html: string, signature: string): string {
  const sig = (signature ?? "").trim()
  if (!sig) return html
  return (
    `${html}` +
    `<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e2e8f0;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#334155;">` +
    `${sig}</div>`
  )
}

/**
 * Resolve, attach, and embed the signature's images — what the send paths call.
 *
 * The images become inline `cid:` attachments rather than staying as URLs,
 * because Outlook blocks remote images by default: a hosted logo shows as a
 * placeholder until the recipient clicks "Download pictures", which on a
 * signature they never do. This is the same mechanism Outlook itself uses.
 *
 * Only the *signature's* images are embedded. A marketing broadcast's banners
 * stay remote — embedding those in every copy would bloat the message and cost
 * deliverability.
 */
export async function withSignature(
  html: string,
  fromEmail: string | null | undefined,
  opts: { embedImages?: boolean } = {},
): Promise<{ html: string; inlineAttachments: EmailAttachment[] }> {
  const sig = await signatureForSender(fromEmail)
  if (!sig) return { html, inlineAttachments: [] }
  // A caller that can't carry attachments (the raw-MIME calendar invite) must
  // opt out: cid: references with nothing behind them are worse than remote
  // images, which at least load for recipients who allow them.
  if (opts.embedImages === false) return { html: appendSignature(html, sig), inlineAttachments: [] }
  const { html: embedded, inlineAttachments } = await embedSignatureImages(sig)
  return { html: appendSignature(html, embedded), inlineAttachments }
}

/**
 * Swap `/api/media/<id>` image srcs in signature HTML for `cid:` references and
 * return the bytes to attach alongside.
 *
 * An asset whose bytes can't be read keeps its original src — a storage hiccup
 * degrades to a remote image, which is what happened before this existed, rather
 * than breaking the send.
 */
export async function embedSignatureImages(
  signatureHtml: string,
): Promise<{ html: string; inlineAttachments: EmailAttachment[] }> {
  const ids: string[] = []
  const re = /src="([^"]*\/api\/media\/[A-Za-z0-9_-]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(signatureHtml)) !== null) {
    const id = mediaIdFromUrl(m[1])
    if (id && !ids.includes(id)) ids.push(id)
  }
  if (!ids.length) return { html: signatureHtml, inlineAttachments: [] }

  const inlineAttachments: EmailAttachment[] = []
  const embeddedIds = new Set<string>()
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN

  for (const id of ids) {
    try {
      const asset = await prisma.mediaAsset.findUnique({
        where: { id }, select: { name: true, blobUrl: true, contentType: true },
      })
      if (!asset) continue
      const res = await fetch(asset.blobUrl, blobToken ? { headers: { Authorization: `Bearer ${blobToken}` } } : undefined)
      if (!res.ok) continue
      const bytes = Buffer.from(await res.arrayBuffer())
      inlineAttachments.push({
        name: asset.name || `${id}.png`,
        contentType: asset.contentType || "image/png",
        contentBase64: bytes.toString("base64"),
        isInline: true,
        contentId: `media-${id}`,
      })
      embeddedIds.add(id)
    } catch {
      // Leave this one as a URL.
    }
  }

  const html = signatureHtml.replace(
    /src="([^"]*\/api\/media\/([A-Za-z0-9_-]+))"/g,
    (whole, _url, id) => (embeddedIds.has(id) ? `src="cid:media-${id}"` : whole),
  )
  return { html, inlineAttachments }
}
