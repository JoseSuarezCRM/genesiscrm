"use server"

import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured, listQuestionnaires } from "@/lib/intakeq"
import { backfillRange } from "@/lib/intakeq-ingest"
import { REFERRAL_CATEGORIES, UNMAPPED } from "@/lib/intakeq-referral"
import { periodOf, recentPeriods, periodLabel, periodStartDate, defaultPeriodCount, chicagoYmd, type Granularity, type IntakeWindow } from "@/lib/intakeq-weeks"
import { encryptSecret, maskTail, randomToken, hasEncryptionKey } from "@/lib/crypto"
import { getIntegration } from "@/lib/integration-store"
import { sendReferralReport, sendScheduledIntakeReport, type IntakeEmailReportConfig } from "@/lib/intakeq-report"

export interface ReferralSourceReport {
  configured: boolean
  granularity: Granularity
  weeks: { start: string; label: string }[]   // the period columns (day/week/month/…)
  categories: string[]
  grid: Record<string, number[]>              // category → count per period
  hasUnmapped: boolean
  unmappedAnswers: { answer: string; count: number }[]
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

  // Distinct raw answers that didn't match a category (across all time), so we can
  // see what needs mapping.
  const unmappedGroups = await (prisma as any).intakeReferralResponse.groupBy({
    by: ["rawAnswer"], where: { category: "Unmapped" }, _count: { _all: true },
  }).catch(() => [])
  const unmappedAnswers = (unmappedGroups as any[])
    .map((g) => ({ answer: g.rawAnswer ?? "(blank)", count: g._count?._all ?? 0 }))
    .sort((a, b) => b.count - a.count)

  return {
    configured: await isIntakeqConfigured(),
    granularity,
    weeks: periods.map((p) => ({ start: p, label: periodLabel(p, granularity) })),
    categories: [...REFERRAL_CATEGORIES],
    grid,
    hasUnmapped,
    unmappedAnswers,
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

  const faRow = await getIntegration("filesanywhere")
  const faCfg = (faRow?.config ?? {}) as any

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
    {
      provider: "filesanywhere",
      name: "FilesAnywhere",
      description: "Weekly EMR CSV → referring providers (by NPI) + appointment records, linked.",
      href: "/settings/integrations/filesanywhere",
      status: (faCfg.host && faCfg.passwordEnc) ? "connected" : "not_connected",
      enabled: !!faRow?.enabled,
      lastActivityAt: faCfg.lastRunAt ?? null,
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
  // Scheduled reconciliation pull (America/Chicago).
  frequency: "daily" | "weekly"
  dayOfWeek: number
  hour: number
  window: IntakeWindow
  lastRunAt: string | null
  // Scheduled email report of the referral-source table.
  emailReport: IntakeEmailReportConfig
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  await requireAccess("REPORTS", "VIEW")
  const row = await getIntegration()
  const cfg = (row?.config ?? {}) as any
  return {
    connected: !!(row?.enabled && row?.apiKeyEnc),
    enabled: !!row?.enabled,
    apiKeyHint: row?.apiKeyHint ?? null,
    hasWebhookSecret: !!row?.webhookSecret,
    webhookSecret: null,
    encryptionReady: hasEncryptionKey(),
    frequency: cfg.frequency ?? "weekly",
    dayOfWeek: cfg.dayOfWeek ?? 1,
    hour: cfg.hour ?? 6,
    window: cfg.window ?? "prior_week",
    lastRunAt: cfg.lastRunAt ?? null,
    emailReport: {
      enabled: cfg.emailReport?.enabled ?? false,
      recipients: cfg.emailReport?.recipients ?? [],
      frequency: cfg.emailReport?.frequency ?? "weekly",
      dayOfWeek: cfg.emailReport?.dayOfWeek ?? 1,
      hour: cfg.emailReport?.hour ?? 7,
      window: cfg.emailReport?.window ?? "last_7_days",
      lastSentAt: cfg.emailReport?.lastSentAt ?? null,
    },
  }
}

// Save the scheduled-pull settings (when it runs + which date window to reconcile).
export async function saveIntakeqSchedule(input: { frequency: "daily" | "weekly"; dayOfWeek: number; hour: number; window: IntakeWindow }): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  try {
    const row = await getIntegration()
    const cfg = (row?.config ?? {}) as any
    await (prisma as any).integration.upsert({
      where: { provider: "intakeq" },
      create: { provider: "intakeq", config: { ...input } },
      update: { config: { ...cfg, ...input } },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true }
  } catch (e: any) { return { error: e?.message ?? "Couldn't save the schedule." } }
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

// ─── Email report ─────────────────────────────────────────────────────────────

// Emails a per-day referral-source report for a selected date range (manual).
export async function sendReferralReportEmail(input: { startDate: string; endDate: string; recipients: string[] }): Promise<{ ok?: boolean; sent?: number; error?: string }> {
  await requireAccess("REPORTS", "VIEW")
  if (!input.startDate || !input.endDate) return { error: "Pick a start and end date." }
  return sendReferralReport(input.startDate, input.endDate, input.recipients ?? [])
}

// Save the scheduled email-report settings.
export async function saveIntakeqReportSchedule(input: { enabled: boolean; recipients: string[]; frequency: "daily" | "weekly"; dayOfWeek: number; hour: number; window: IntakeWindow }): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  try {
    const row = await getIntegration()
    const cfg = (row?.config ?? {}) as any
    const recipients = (input.recipients ?? []).map((r) => r.trim()).filter(Boolean)
    const emailReport = { enabled: !!input.enabled, recipients, frequency: input.frequency, dayOfWeek: input.dayOfWeek, hour: input.hour, window: input.window, lastSentAt: cfg.emailReport?.lastSentAt ?? null }
    await (prisma as any).integration.upsert({
      where: { provider: "intakeq" },
      create: { provider: "intakeq", config: { emailReport } },
      update: { config: { ...cfg, emailReport } },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true }
  } catch (e: any) { return { error: e?.message ?? "Couldn't save." } }
}

// Send the scheduled report now (manual test — doesn't touch lastSentAt).
export async function sendIntakeReportNow(): Promise<{ ok?: boolean; message?: string; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  const r = await sendScheduledIntakeReport({ manual: true })
  if (r.error) return { error: r.error }
  return { ok: true, message: `Sent to ${r.sent} recipient(s) — ${r.total} total responses in the window.` }
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
    (prisma as any).integrationEvent.findMany({ where: { provider: "intakeq", createdAt: { gte: since } }, select: { ok: true, createdAt: true } }),
    (prisma as any).integrationEvent.findMany({ where: { provider: "intakeq" }, orderBy: { createdAt: "desc" }, take: 60 }),
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

// ─── Recent submissions (who filled the intake) ──────────────────────────────

export interface IntakeSubmission {
  id: string
  clientName: string | null
  clientId: string | null
  category: string
  language: string | null
  submittedAt: string
}

// The most recent stored intake submissions, newest first. Contains patient
// names (PHI) — gated by REPORTS VIEW, same as the rest of the integration page.
export async function getRecentIntakeSubmissions(limit = 50): Promise<IntakeSubmission[]> {
  await requireAccess("REPORTS", "VIEW")
  const rows = await (prisma as any).intakeReferralResponse.findMany({
    orderBy: { submittedAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
    select: { id: true, clientName: true, clientId: true, category: true, language: true, submittedAt: true },
  })
  return (rows as any[]).map((r) => ({
    id: r.id,
    clientName: r.clientName ?? null,
    clientId: r.clientId ?? null,
    category: r.category,
    language: r.language ?? null,
    submittedAt: new Date(r.submittedAt).toISOString(),
  }))
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
