// The shared org mailboxes the app can send as.
//
// These were three constants driven by env vars; they're rows now, so an admin
// can add one in Settings without a deploy. The env values remain the seed, and
// the fallback if the table is empty — a fresh database or a failed migration
// must not take email down.
//
// Server-only: imports Prisma.

import { prisma } from "@/lib/prisma"

/** The original three identifiers, still stored in saved workflow/sequence configs. */
export type LegacySenderKey = "referrals" | "surgery" | "tpl"

export interface SharedMailboxInfo {
  id: string
  email: string
  label: string
  legacyKey: string | null
  signatureHtml: string | null
}

// What the three mailboxes were before this table existed. Used to seed it, and
// as a last resort if it can't be read.
export const SEED_MAILBOXES: { legacyKey: LegacySenderKey; email: string; label: string; order: number }[] = [
  { legacyKey: "referrals", email: process.env.MS_FROM_EMAIL ?? "Referrals@genesisortho.com", label: "Referrals", order: 0 },
  { legacyKey: "surgery", email: process.env.MS_SURGERY_FROM_EMAIL ?? "surgery@genesisortho.com", label: "Surgery", order: 1 },
  { legacyKey: "tpl", email: process.env.MS_TPL_FROM_EMAIL ?? "tpl@genesisortho.com", label: "TPL", order: 2 },
]

const FALLBACK: SharedMailboxInfo[] = SEED_MAILBOXES.map((m) => ({
  id: m.legacyKey, email: m.email, label: m.email, legacyKey: m.legacyKey, signatureHtml: null,
}))

// Sender lists are read on nearly every page that can compose an email, and the
// set changes about once a year. A short cache keeps that off the hot path.
const TTL_MS = 60_000
let cache: { at: number; rows: SharedMailboxInfo[] } | null = null

export function invalidateMailboxCache() {
  cache = null
}

/** Every enabled shared mailbox, in display order. Never throws. */
export async function listSharedMailboxes(): Promise<SharedMailboxInfo[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  try {
    const rows = await (prisma as any).sharedMailbox.findMany({
      where: { enabled: true },
      orderBy: [{ order: "asc" }, { email: "asc" }],
      select: { id: true, email: true, label: true, legacyKey: true, signatureHtml: true },
    })
    // An empty table means the seed hasn't run yet — don't strip every sender
    // option out of the UI on the strength of that.
    const out: SharedMailboxInfo[] = rows.length ? rows : FALLBACK
    cache = { at: Date.now(), rows: out }
    return out
  } catch {
    return FALLBACK
  }
}

/** Resolve a saved sender value — a legacy key, or the address itself. */
export async function mailboxForSenderValue(value: string | null | undefined): Promise<SharedMailboxInfo | null> {
  const v = (value ?? "").trim()
  if (!v) return null
  const all = await listSharedMailboxes()
  if (v.includes("@")) return all.find((m) => m.email.toLowerCase() === v.toLowerCase()) ?? null
  return all.find((m) => m.legacyKey === v) ?? null
}

/** The from-address for a saved sender value, defaulting to the first mailbox. */
export async function senderEmailFor(value?: string | null): Promise<string> {
  const match = await mailboxForSenderValue(value ?? "referrals")
  if (match) return match.email
  const all = await listSharedMailboxes()
  return all[0]?.email ?? FALLBACK[0].email
}

/** A shared mailbox by address, enabled or not — used by signature resolution. */
export async function findMailboxByEmail(email: string): Promise<SharedMailboxInfo | null> {
  const e = (email ?? "").trim().toLowerCase()
  if (!e) return null
  const all = await listSharedMailboxes()
  return all.find((m) => m.email.toLowerCase() === e) ?? null
}

/**
 * Create the three original mailboxes if the table is empty. Idempotent, and
 * safe to call from a page render — it does nothing once seeded.
 */
export async function ensureSeeded(): Promise<void> {
  try {
    const count = await (prisma as any).sharedMailbox.count()
    if (count > 0) return
    for (const m of SEED_MAILBOXES) {
      await (prisma as any).sharedMailbox.create({
        data: { email: m.email, label: m.label, legacyKey: m.legacyKey, order: m.order },
      })
    }
    invalidateMailboxCache()
  } catch {
    // A seed race (two requests at once) hits the unique index; harmless.
  }
}
