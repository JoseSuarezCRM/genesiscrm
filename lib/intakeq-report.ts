// Referral-source email report (categories × days), shared by the manual
// "send report" action and the scheduled sender. Un-gated: callers enforce access.

import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/graph-mailer"
import { REFERRAL_CATEGORIES } from "@/lib/intakeq-referral"
import { chicagoYmd, resolveIntakeWindow, type IntakeWindow } from "@/lib/intakeq-weeks"
import { getIntegration } from "@/lib/integration-store"

function dayLabelShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

// Build the referral-source HTML table (categories × days) for a YMD range.
async function buildFromDays(startDate: string, endDate: string, days: string[], startMs: number, endMs: number) {
  const rows = await (prisma as any).intakeReferralResponse.findMany({
    where: { submittedAt: { gte: new Date(startMs - 86400000), lte: new Date(endMs + 2 * 86400000) }, category: { not: "Unanswered" } },
    select: { submittedAt: true, category: true },
  })
  const idx = Object.fromEntries(days.map((d, i) => [d, i]))
  const grid: Record<string, number[]> = {}
  for (const cat of REFERRAL_CATEGORIES) grid[cat] = days.map(() => 0)
  for (const r of rows as { submittedAt: Date; category: string }[]) {
    const di = idx[chicagoYmd(r.submittedAt)]
    if (di === undefined) continue
    if (!grid[r.category]) grid[r.category] = days.map(() => 0)
    grid[r.category][di]++
  }
  const colTotals = days.map((_, di) => REFERRAL_CATEGORIES.reduce((s, c) => s + (grid[c]?.[di] ?? 0), 0))
  const rowTotal = (c: string) => (grid[c] ?? []).reduce((s, n) => s + n, 0)
  const grand = colTotals.reduce((s, n) => s + n, 0)

  const th = 'style="padding:6px 8px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#475569;text-align:right;"'
  const thL = 'style="padding:6px 8px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#475569;text-align:left;"'
  const td = 'style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;text-align:right;"'
  const tdL = 'style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;text-align:left;font-weight:600;"'
  const cell = (n: number) => (n === 0 ? '<span style="color:#cbd5e1;">—</span>' : String(n))
  const header = `<tr><th ${thL}>Referral Source</th>${days.map((d) => `<th ${th}>${dayLabelShort(d)}</th>`).join("")}<th ${th}>Total</th></tr>`
  const body = REFERRAL_CATEGORIES.map((c) =>
    `<tr><td ${tdL}>${c}</td>${days.map((_, di) => `<td ${td}>${cell(grid[c]?.[di] ?? 0)}</td>`).join("")}<td ${td}><b>${rowTotal(c)}</b></td></tr>`
  ).join("")
  const footer = `<tr><td ${tdL}>Total</td>${colTotals.map((n) => `<td ${td}><b>${n}</b></td>`).join("")}<td ${td}><b>${grand}</b></td></tr>`

  const subject = `Referral Sources — ${startDate} to ${endDate}`
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:0 auto;color:#1e293b;">
      <h2 style="color:#0f172a;">Referral Sources</h2>
      <p style="color:#64748b;font-size:13px;">${startDate} → ${endDate} · daily counts (English + Spanish), from the Gosm 2026 Full Intake form.</p>
      <div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;">${header}${body}${footer}</table></div>
      <p style="color:#94a3b8;font-size:11px;margin-top:16px;">Sent from Genesis CRM · Integrations → IntakeQ</p>
    </div>`
  return { subject, html, total: grand }
}

// Build the report for a range and email it.
export async function sendReferralReport(startDate: string, endDate: string, recipients: string[]): Promise<{ ok?: boolean; sent?: number; total?: number; error?: string }> {
  const to = (recipients ?? []).map((r) => r.trim()).filter(Boolean)
  if (!to.length) return { error: "Add at least one recipient email." }
  const [sy, sm, sd] = startDate.split("-").map(Number)
  const [ey, em, ed] = endDate.split("-").map(Number)
  const startMs = Date.UTC(sy, sm - 1, sd), endMs = Date.UTC(ey, em - 1, ed)
  if (endMs < startMs) return { error: "End date is before start date." }
  if ((endMs - startMs) / 86400000 > 92) return { error: "Range is too large — pick 3 months or less." }
  const days: string[] = []
  for (let t = startMs; t <= endMs; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10))
  const { subject, html, total } = await buildFromDays(startDate, endDate, days, startMs, endMs)
  const res = await sendEmail(to, subject, html)
  if (!res.success) return { error: res.error ?? "Failed to send the email." }
  return { ok: true, sent: to.length, total }
}

export interface IntakeEmailReportConfig { enabled: boolean; recipients: string[]; frequency: "daily" | "weekly"; dayOfWeek: number; hour: number; window: IntakeWindow; lastSentAt: string | null }

function patchReportConfig(cfg: any, emailReport: Partial<IntakeEmailReportConfig>) {
  return (prisma as any).integration.update({
    where: { provider: "intakeq" },
    data: { config: { ...cfg, emailReport: { ...(cfg.emailReport ?? {}), ...emailReport } } },
  })
}

// Send the scheduled report using the configured recipients + window. Manual
// sends don't touch lastSentAt (so they can't suppress the scheduled send).
export async function sendScheduledIntakeReport(opts: { manual?: boolean } = {}): Promise<{ ok?: boolean; sent?: number; total?: number; error?: string }> {
  const integ = await getIntegration("intakeq")
  const cfg = (integ?.config ?? {}) as any
  const r = cfg.emailReport as IntakeEmailReportConfig | undefined
  const recipients = (r?.recipients ?? []).filter(Boolean)
  if (!recipients.length) return { error: "No report recipients configured." }
  const { start, end } = resolveIntakeWindow((r?.window ?? "last_7_days") as IntakeWindow)
  const res = await sendReferralReport(start, end, recipients)
  if (res.error) return res
  if (!opts.manual) await patchReportConfig(cfg, { lastSentAt: new Date().toISOString() }).catch(() => {})
  return res
}
