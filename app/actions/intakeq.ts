"use server"

import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured, listQuestionnaires } from "@/lib/intakeq"
import { backfillRange } from "@/lib/intakeq-ingest"
import { REFERRAL_CATEGORIES, UNMAPPED } from "@/lib/intakeq-referral"
import { periodOf, recentPeriods, periodLabel, periodStartDate, defaultPeriodCount, type Granularity } from "@/lib/intakeq-weeks"
import { encryptSecret, maskTail, randomToken, hasEncryptionKey } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"

export interface ReferralSourceReport {
  configured: boolean
  granularity: Granularity
  weeks: { start: string; label: string }[]   // the period columns (day/week/month/…)
  categories: string[]
  grid: Record<string, number[]>              // category → count per period
  hasUnmapped: boolean
  lastSubmittedAt: string | null
  totalStored: number
}

// The categories × periods grid, English + Spanish already summed per category.
// `granularity` picks the column bucket: day / week / month / quarter / year.
export async function getReferralSourceReport(granularity: Granularity = "week"): Promise<ReferralSourceReport> {
  await requireAccess("REPORTS", "VIEW")

  const periods = recentPeriods(granularity, defaultPeriodCount(granularity))
  const since = periodStartDate(periods[0], granularity)
  since.setUTCDate(since.getUTCDate() - 1) // tz buffer

  const [rows, latest, totalStored] = await Promise.all([
    (prisma as any).intakeReferralResponse.findMany({
      where: { submittedAt: { gte: since }, category: { not: "Unanswered" } },
      select: { submittedAt: true, category: true },
    }),
    (prisma as any).intakeReferralResponse.findFirst({ orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }),
    (prisma as any).intakeReferralResponse.count(),
  ])

  const index = Object.fromEntries(periods.map((p, i) => [p, i]))
  const grid: Record<string, number[]> = {}
  for (const cat of [...REFERRAL_CATEGORIES, UNMAPPED]) grid[cat] = periods.map(() => 0)

  let hasUnmapped = false
  for (const r of rows as { submittedAt: Date; category: string }[]) {
    const pi = index[periodOf(r.submittedAt, granularity)]
    if (pi === undefined) continue
    if (!grid[r.category]) grid[r.category] = periods.map(() => 0)
    grid[r.category][pi]++
    if (r.category === UNMAPPED) hasUnmapped = true
  }

  return {
    configured: await isIntakeqConfigured(),
    granularity,
    weeks: periods.map((p) => ({ start: p, label: periodLabel(p, granularity) })),
    categories: [...REFERRAL_CATEGORIES],
    grid,
    hasUnmapped,
    lastSubmittedAt: latest?.submittedAt ? new Date(latest.submittedAt).toISOString() : null,
    totalStored,
  }
}

// Pull + categorize existing submissions for a date range (bounded; run again if
// `remaining` > 0). Used to backfill history the webhook didn't capture.
export async function runIntakeBackfill(startDate: string, endDate: string): Promise<{ processed?: number; remaining?: number; candidates?: number; rateLimited?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  if (!(await isIntakeqConfigured())) return { error: "IntakeQ API key isn't configured yet." }
  if (!startDate || !endDate) return { error: "Pick a start and end date." }
  try {
    return await backfillRange(startDate, endDate)
  } catch (e: any) {
    return { error: e?.message ?? "Backfill failed." }
  }
}

// ─── Integrations index (Connected Apps table) ───────────────────────────────

export interface IntegrationListItem {
  provider: string
  name: string
  description: string
  href: string
  status: "connected" | "not_connected"
  enabled: boolean
  lastActivityAt: string | null
}

export async function getIntegrationsList(): Promise<IntegrationListItem[]> {
  await requireAccess("REPORTS", "VIEW")
  const row = await getIntegration()
  const configured = await isIntakeqConfigured()
  const [lastEvent, lastSub] = await Promise.all([
    (prisma as any).integrationEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    (prisma as any).intakeReferralResponse.findFirst({ orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }).catch(() => null),
  ])
  const times = [lastEvent?.createdAt, lastSub?.submittedAt].filter(Boolean).map((d: any) => new Date(d).getTime())
  const lastActivityAt = times.length ? new Date(Math.max(...times)).toISOString() : null

  return [
    {
      provider: "intakeq",
      name: "IntakeQ",
      description: "New-patient referral sources — weekly report from the Full Intake form.",
      href: "/settings/integrations/intakeq",
      status: configured ? "connected" : "not_connected",
      enabled: !!row?.enabled,
      lastActivityAt,
    },
  ]
}

// ─── Credential management (UI-managed, encrypted at rest) ────────────────────

export interface IntegrationSettings {
  connected: boolean
  enabled: boolean
  apiKeyHint: string | null   // masked tail, never the key itself
  hasWebhookSecret: boolean
  webhookSecret: string | null // returned only right after (re)generating
  encryptionReady: boolean
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  await requireAccess("REPORTS", "VIEW")
  const row = await getIntegration()
  return {
    connected: !!(row?.enabled && row?.apiKeyEnc),
    enabled: !!row?.enabled,
    apiKeyHint: row?.apiKeyHint ?? null,
    hasWebhookSecret: !!row?.webhookSecret,
    webhookSecret: null,
    encryptionReady: hasEncryptionKey(),
  }
}

// Store (or rotate) the IntakeQ API key — encrypted; enables the integration.
export async function saveIntakeqApiKey(apiKey: string): Promise<{ ok?: boolean; error?: string; hint?: string }> {
  await requireAccess("REPORTS", "EDIT")
  const key = (apiKey ?? "").trim()
  if (!key) return { error: "Paste an API key." }
  if (!hasEncryptionKey()) return { error: "ENCRYPTION_KEY isn't set on the server yet." }
  const uid = (await auth())?.user?.id ?? null
  const hint = maskTail(key)
  try {
    await (prisma as any).integration.upsert({
      where: { provider: "intakeq" },
      create: { provider: "intakeq", enabled: true, apiKeyEnc: encryptSecret(key), apiKeyHint: hint, updatedById: uid },
      update: { enabled: true, apiKeyEnc: encryptSecret(key), apiKeyHint: hint, updatedById: uid },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true, hint }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't save the key." }
  }
}

// Generate a new webhook secret and return it (shown once) so the admin can paste
// the full webhook URL into IntakeQ.
export async function generateWebhookSecret(): Promise<{ secret?: string; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  const uid = (await auth())?.user?.id ?? null
  const secret = randomToken(24)
  try {
    await (prisma as any).integration.upsert({
      where: { provider: "intakeq" },
      create: { provider: "intakeq", webhookSecret: secret, updatedById: uid },
      update: { webhookSecret: secret, updatedById: uid },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { secret }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't generate a secret." }
  }
}

export async function setIntakeqEnabled(enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  try {
    await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { enabled } })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't update." }
  }
}

// Remove the stored key (and disable). Keeps history rows intact.
export async function disconnectIntakeq(): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  try {
    await (prisma as any).integration.updateMany({
      where: { provider: "intakeq" },
      data: { enabled: false, apiKeyEnc: null, apiKeyHint: null },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't disconnect." }
  }
}

// ─── Activity (API calls + webhook deliveries) ────────────────────────────────

export interface IntegrationActivity {
  totalCalls7d: number
  errors7d: number
  perDay: { day: string; calls: number; errors: number }[]
  recent: { id: string; kind: string; endpoint: string | null; method: string | null; status: number | null; ok: boolean; message: string | null; durationMs: number | null; at: string }[]
}

export async function getIntegrationActivity(): Promise<IntegrationActivity> {
  await requireAccess("REPORTS", "VIEW")

  // Keep the log bounded — drop events older than 30 days.
  await (prisma as any).integrationEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } }).catch(() => {})

  const since = new Date(Date.now() - 7 * 86400000)
  const [events, recent] = await Promise.all([
    (prisma as any).integrationEvent.findMany({ where: { createdAt: { gte: since } }, select: { ok: true, createdAt: true } }),
    (prisma as any).integrationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ])

  // Last 7 calendar days (America/Chicago), oldest first.
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    days.push(d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
  }
  const byDay: Record<string, { calls: number; errors: number }> = {}
  for (const d of days) byDay[d] = { calls: 0, errors: 0 }
  let errors7d = 0
  for (const e of events as { ok: boolean; createdAt: Date }[]) {
    const d = new Date(e.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Chicago" })
    if (byDay[d]) { byDay[d].calls++; if (!e.ok) byDay[d].errors++ }
    if (!e.ok) errors7d++
  }

  return {
    totalCalls7d: events.length,
    errors7d,
    perDay: days.map((d) => ({ day: d, calls: byDay[d].calls, errors: byDay[d].errors })),
    recent: (recent as any[]).map((r) => ({
      id: r.id, kind: r.kind, endpoint: r.endpoint, method: r.method, status: r.status, ok: r.ok, message: r.message, durationMs: r.durationMs,
      at: new Date(r.createdAt).toISOString(),
    })),
  }
}

// Diagnostics: list questionnaire templates so we can confirm the exact form name.
export async function listIntakeQuestionnaires(): Promise<{ items?: { Id: string; Name: string; Archived: boolean }[]; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  if (!(await isIntakeqConfigured())) return { error: "IntakeQ API key isn't configured yet." }
  try {
    return { items: await listQuestionnaires() }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't reach IntakeQ." }
  }
}
