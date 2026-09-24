"use server"

import { requireAccess } from "@/lib/auth-guard"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { isIntakeqConfigured, listQuestionnaires } from "@/lib/intakeq"
import { backfillRange } from "@/lib/intakeq-ingest"
import { REFERRAL_CATEGORIES, UNMAPPED, ALL_FORMS, DEFAULT_INTAKE_FORMS, isTargetQuestionnaire, matchesReportForm } from "@/lib/intakeq-referral"
import { periodOf, recentPeriods, periodLabel, periodStartDate, defaultPeriodCount, chicagoYmd, type Granularity, type IntakeWindow } from "@/lib/intakeq-weeks"
import { encryptSecret, maskTail, randomToken, hasEncryptionKey } from "@/lib/crypto"
import { getIntegration, getIntakeForms } from "@/lib/integration-store"
import { sendReferralReport, sendScheduledIntakeReport, type IntakeEmailReportConfig } from "@/lib/intakeq-report"
import { attributeReferralSources, type SourceMapping, type AttributionResult } from "@/lib/appointment-source"

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
  /** Which form the grid is filtered to — ALL_FORMS, or a configured fragment. */
  form: string
  formOptions: ReportFormOption[]
}

/** One entry in the report's form selector. `count` is what it contributes. */
export interface ReportFormOption {
  value: string
  label: string
  count: number
}

// The categories × periods grid, English + Spanish already summed per category.
// `granularity` picks the column bucket: day / week / month / quarter / year.
export async function getReferralSourceReport(
  granularity: Granularity = "week",
  form: string = ALL_FORMS,
): Promise<ReferralSourceReport> {
  await requireAccess("REPORTS", "VIEW")

  const periods = recentPeriods(granularity, defaultPeriodCount(granularity))
  const since = periodStartDate(periods[0], granularity)
  since.setUTCDate(since.getUTCDate() - 1) // tz buffer

  const [rows, latest, totalStored] = await Promise.all([
    // No form predicate in SQL — the selection is applied below with the same
    // matcher ingestion uses, so the report and the Forms-to-ingest list can
    // never disagree about what counts. See matchesReportForm().
    (prisma as any).intakeReferralResponse.findMany({
      where: {
        submittedAt: { gte: since },
        category: { not: "Unanswered" },
      },
      select: { submittedAt: true, category: true, questionnaireName: true },
    }),
    (prisma as any).intakeReferralResponse.findFirst({ orderBy: { submittedAt: "desc" }, select: { submittedAt: true } }),
    (prisma as any).intakeReferralResponse.count(),
  ])

  const index = Object.fromEntries(periods.map((p, i) => [p, i]))
  const grid: Record<string, number[]> = {}
  for (const cat of [...REFERRAL_CATEGORIES, UNMAPPED]) grid[cat] = periods.map(() => 0)

  let hasUnmapped = false
  for (const r of rows as { submittedAt: Date; category: string; questionnaireName: string | null }[]) {
    if (!matchesReportForm(r.questionnaireName, form)) continue
    const pi = index[periodOf(r.submittedAt, granularity)]
    if (pi === undefined) continue
    if (!grid[r.category]) grid[r.category] = periods.map(() => 0)
    grid[r.category][pi]++
    if (r.category === UNMAPPED) hasUnmapped = true
  }

  // Distinct raw answers that didn't match a category (across all time), so we can
  // see what needs mapping. Grouped by form as well as answer so this respects the
  // selection — it never did before, which meant it listed FD/admin answers
  // underneath a grid that excluded them.
  const unmappedGroups = await (prisma as any).intakeReferralResponse.groupBy({
    by: ["rawAnswer", "questionnaireName"], where: { category: "Unmapped" }, _count: { _all: true },
  }).catch(() => [])
  const unmappedByAnswer = new Map<string, number>()
  for (const g of unmappedGroups as any[]) {
    if (!matchesReportForm(g.questionnaireName, form)) continue
    const key = g.rawAnswer ?? "(blank)"
    unmappedByAnswer.set(key, (unmappedByAnswer.get(key) ?? 0) + (g._count?._all ?? 0))
  }
  const unmappedAnswers = Array.from(unmappedByAnswer.entries())
    .map(([answer, count]) => ({ answer, count }))
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
    form,
    formOptions: await listReportForms(),
  }
}

/**
 * The options for the report's form selector.
 *
 * Built from the form names actually stored, then bucketed under the configured
 * fragment that matches each one. Two reasons it isn't just one or the other:
 * the raw stored name ("GOSM 2026 Full Intake") is what a human recognises, but
 * selecting by it would split the series the year the form is renamed — and the
 * configured fragment ("full intake") is stable but means nothing on screen.
 *
 * A stored name matching no configured fragment still gets its own option. That
 * is history from a form since renamed or removed from the list, and without an
 * option for it there would be no way to look at it.
 */
async function listReportForms(): Promise<ReportFormOption[]> {
  const [groups, configured] = await Promise.all([
    (prisma as any).intakeReferralResponse
      .groupBy({ by: ["questionnaireName"], where: { category: { not: "Unanswered" } }, _count: { _all: true } })
      .catch(() => []),
    getIntakeForms(),
  ])

  const stored = (groups as any[]).map((g) => ({
    name: (g.questionnaireName ?? "") as string,
    count: (g._count?._all ?? 0) as number,
  }))

  const options: ReportFormOption[] = []
  const claimed = new Set<string>()

  for (const fragment of configured) {
    const matches = stored.filter((row) => isTargetQuestionnaire(row.name, [fragment]))
    if (!matches.length) continue
    for (const m of matches) claimed.add(m.name)
    options.push({
      value: fragment,
      // One stored name reads best verbatim; several means the form was renamed,
      // and the fragment is what actually holds them together.
      label: matches.length === 1 ? matches[0].name : `${fragment} (${matches.length} form names)`,
      count: matches.reduce((sum, m) => sum + m.count, 0),
    })
  }

  for (const row of stored) {
    if (claimed.has(row.name) || !row.name) continue
    options.push({ value: row.name, label: row.name, count: row.count })
  }

  options.sort((a, b) => b.count - a.count)
  const total = stored.reduce((sum, row) => sum + row.count, 0)
  return [{ value: ALL_FORMS, label: "All forms", count: total }, ...options]
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

// ─── Server-side backfill job (drains in the background, survives tab close) ──

export interface IntakeBackfillStatus {
  active: boolean
  processed: number
  remaining: number | null
  done: boolean
  startDate: string | null
  endDate: string | null
  rateLimitedUntil: string | null
  error: string | null
}

function backfillStatusOf(cfg: any): IntakeBackfillStatus {
  const b = cfg?.backfill ?? null
  return {
    active: !!b?.active,
    processed: b?.processed ?? 0,
    remaining: b?.remaining ?? null,
    done: !!b?.done,
    startDate: b?.startDate ?? null,
    endDate: b?.endDate ?? null,
    rateLimitedUntil: b?.rateLimitedUntil ?? null,
    error: b?.error ?? null,
  }
}

// Kick off a background backfill for a date range. The minutely cron
// (/api/cron/intakeq-backfill) drains it to completion — closing the page no
// longer stops it.
export async function startIntakeBackfill(startDate: string, endDate: string): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireAccess("REPORTS", "EDIT")
  if (!(await isIntakeqConfigured())) return { error: "IntakeQ API key isn't configured yet." }
  if (!startDate || !endDate) return { error: "Pick a start and end date." }
  const row = await getIntegration()
  const cfg = (row?.config ?? {}) as any
  if (cfg.backfill?.active) return { error: "A backfill is already running." }
  const backfill = {
    active: true, startDate, endDate,
    processed: 0, remaining: null, candidates: null,
    startedAt: new Date().toISOString(), startedById: (session!.user as any).id ?? null,
    lastBatchAt: null, rateLimitedUntil: null, lockUntil: null, done: false, doneAt: null, error: null,
  }
  await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { config: { ...cfg, backfill } } })
  return { ok: true }
}

export async function stopIntakeBackfill(): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  const row = await getIntegration()
  const cfg = (row?.config ?? {}) as any
  if (cfg.backfill) {
    await (prisma as any).integration.update({ where: { provider: "intakeq" }, data: { config: { ...cfg, backfill: { ...cfg.backfill, active: false } } } }).catch(() => {})
  }
  return { ok: true }
}

export async function getIntakeBackfillStatus(): Promise<IntakeBackfillStatus> {
  await requireAccess("REPORTS", "VIEW")
  const row = await getIntegration()
  return backfillStatusOf(row?.config ?? {})
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
      description: "New-patient referral sources — weekly report from the ingested intake forms.",
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
  // Where the matched referral source gets written (object + properties).
  sourceMapping: SourceMapping | null
  // Which IntakeQ forms get ingested (loose name fragments).
  intakeForms: string[]
  // The form the weekly report counts — everything else is attribution-only.
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
    intakeForms: Array.isArray(cfg.intakeForms) && cfg.intakeForms.length ? cfg.intakeForms : [...DEFAULT_INTAKE_FORMS],
    emailReport: {
      enabled: cfg.emailReport?.enabled ?? false,
      recipients: cfg.emailReport?.recipients ?? [],
      frequency: cfg.emailReport?.frequency ?? "weekly",
      dayOfWeek: cfg.emailReport?.dayOfWeek ?? 1,
      hour: cfg.emailReport?.hour ?? 7,
      window: cfg.emailReport?.window ?? "last_7_days",
      lastSentAt: cfg.emailReport?.lastSentAt ?? null,
    },
    sourceMapping: cfg.sourceMapping ?? null,
  }
}

// ── Referral-source mapping (which object/properties receive the source) ─────

export interface SourceMappingObject {
  key: string
  label: string
  dateProps: { id: string; name: string }[]
  textProps: { id: string; name: string }[]
}

/** Custom objects + their DATE / text-ish properties, for the mapping pickers. */
export async function getSourceMappingOptions(): Promise<SourceMappingObject[]> {
  await requireAccess("REPORTS", "VIEW")
  const defs = await (prisma as any).customObjectDef.findMany({
    orderBy: { plural: "asc" }, select: { key: true, plural: true, properties: true },
  }).catch(() => [])
  return (defs as any[]).map((d) => {
    const props: any[] = (d.properties as any[]) ?? []
    return {
      key: `CO:${d.key}`,
      label: d.plural,
      dateProps: props.filter((p) => p.type === "DATE" || p.type === "DATE_TIME").map((p) => ({ id: p.id, name: p.name })),
      textProps: props.filter((p) => ["TEXT", "LONG_TEXT", "DROPDOWN"].includes(p.type)).map((p) => ({ id: p.id, name: p.name })),
    }
  })
}

export async function saveIntakeqSourceMapping(input: SourceMapping | null): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  try {
    const row = await getIntegration()
    const cfg = (row?.config ?? {}) as any
    await (prisma as any).integration.upsert({
      where: { provider: "intakeq" },
      create: { provider: "intakeq", config: { sourceMapping: input } },
      update: { config: { ...cfg, sourceMapping: input } },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true }
  } catch (e: any) { return { error: e?.message ?? "Couldn't save the mapping." } }
}

/** Backfill: attribute referral sources to mapped records that don't have one yet. */
export async function runSourceAttribution(): Promise<AttributionResult> {
  await requireAccess("REPORTS", "EDIT")
  const res = await attributeReferralSources({ onlyMissing: true })
  revalidatePath("/settings/integrations/intakeq")
  return res
}

/**
 * Which IntakeQ forms get ingested. Matched loosely against the form name, so a
 * fragment ("full intake") survives the yearly rename. Everything ingested feeds
 * appointment attribution, and every one of them is counted in the referral-source
 * report (which can be filtered to a single form on screen).
 */
export async function saveIntakeForms(forms: string[]): Promise<{ ok?: boolean; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  const clean = (forms ?? []).map((f) => f.trim()).filter(Boolean)
  if (!clean.length) return { error: "Keep at least one form — an empty list would stop all ingestion." }
  try {
    const row = await getIntegration()
    const cfg = (row?.config ?? {}) as any
    await (prisma as any).integration.upsert({
      where: { provider: "intakeq" },
      create: { provider: "intakeq", config: { intakeForms: clean } },
      update: { config: { ...cfg, intakeForms: clean } },
    })
    revalidatePath("/settings/integrations/intakeq")
    return { ok: true }
  } catch (e: any) { return { error: e?.message ?? "Couldn't save the form list." } }
}

/**
 * The real form names in IntakeQ, each flagged with whether the current list would
 * ingest it — so a rename that silently stopped a form shows up here instead of as
 * missing data weeks later.
 */
export async function checkIntakeForms(forms: string[]): Promise<{ items?: { name: string; archived: boolean; matched: boolean }[]; error?: string }> {
  await requireAccess("REPORTS", "EDIT")
  if (!(await isIntakeqConfigured())) return { error: "IntakeQ API key isn't configured yet." }
  try {
    const list = await listQuestionnaires()
    return {
      items: list.map((q) => ({
        name: q.Name,
        archived: !!q.Archived,
        matched: isTargetQuestionnaire(q.Name, forms),
      })),
    }
  } catch (e: any) {
    return { error: e?.message ?? "Couldn't reach IntakeQ." }
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
  dateOfBirth: string | null
  category: string
  language: string | null
  submittedAt: string
}

// The most recent stored intake submissions, newest first (paginated). Contains
// patient names (PHI) — gated by REPORTS VIEW, same as the rest of the page.
export async function getRecentIntakeSubmissions(limit = 50, offset = 0): Promise<IntakeSubmission[]> {
  await requireAccess("REPORTS", "VIEW")
  const rows = await (prisma as any).intakeReferralResponse.findMany({
    orderBy: { submittedAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
    skip: Math.max(0, offset),
    select: { id: true, clientName: true, clientId: true, dateOfBirth: true, category: true, language: true, submittedAt: true },
  })
  return (rows as any[]).map((r) => ({
    id: r.id,
    clientName: r.clientName || null,
    clientId: r.clientId ?? null,
    dateOfBirth: r.dateOfBirth ?? null,
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
