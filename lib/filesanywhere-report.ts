// Weekly email report: referring providers created in the last 7 days, each with
// its associated appointment(s), as an HTML table. Reuses the FilesAnywhere
// integration config (provider/appointment object keys + report recipients).

import { prisma } from "@/lib/prisma"
import { getIntegration } from "@/lib/integration-store"
import { sendEmail } from "@/lib/graph-mailer"
import { recordName } from "@/lib/record-name"
import type { FaConfig } from "@/lib/filesanywhere-import"

const WEEK_MS = 7 * 86_400_000

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

// Render a property value for a table cell, honoring its type.
function cellValue(v: any, type: string, optionLabels?: Record<string, string>): string {
  if (v == null || v === "") return ""
  if (Array.isArray(v)) return v.map((x) => optionLabels?.[String(x)] ?? String(x)).join(", ")
  if (type === "DATE" || type === "DATE_TIME") {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return type === "DATE_TIME"
      ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
      : fmtDay(d)
  }
  if (type === "DROPDOWN" && optionLabels) return optionLabels[String(v)] ?? String(v)
  return String(v)
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export interface FaReport { providerCount: number; rowCount: number; subject: string; html: string }

// Build the report for providers created since (now - 7 days).
export async function buildProviderReport(cfg: FaConfig): Promise<FaReport> {
  const since = new Date(Date.now() - WEEK_MS)
  const provType = `CO:${cfg.providerObjectSlug}`
  const apptType = `CO:${cfg.objectSlug}`

  const [provDef, apptDef] = await Promise.all([
    (prisma as any).customObjectDef.findUnique({ where: { key: cfg.providerObjectSlug } }),
    (prisma as any).customObjectDef.findUnique({ where: { key: cfg.objectSlug } }),
  ])
  // Columns: all object properties, or just the selected subset (in def order).
  const provSel = cfg.report?.providerFields
  const apptSel = cfg.report?.appointmentFields
  const provProps: any[] = ((provDef?.properties as any[]) ?? []).filter((p) => !provSel?.length || provSel.includes(p.id))
  const apptProps: any[] = ((apptDef?.properties as any[]) ?? []).filter((p) => !apptSel?.length || apptSel.includes(p.id))

  const providers = await (prisma as any).customObjectRecord.findMany({
    where: { objectDefId: provDef?.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  })
  const provIds: string[] = providers.map((p: any) => p.id)

  // Appointments linked to those providers (the import stores appt→provider, but
  // check both orderings to be safe).
  const apptByProvider = new Map<string, string[]>()
  if (provIds.length) {
    const assoc = await (prisma as any).objectAssociation.findMany({
      where: { OR: [
        { fromType: apptType, toType: provType, toId: { in: provIds } },
        { fromType: provType, fromId: { in: provIds }, toType: apptType },
      ] },
    })
    for (const a of assoc) {
      let provId: string | null = null, apptId: string | null = null
      if (a.toType === provType && a.fromType === apptType) { provId = a.toId; apptId = a.fromId }
      else if (a.fromType === provType && a.toType === apptType) { provId = a.fromId; apptId = a.toId }
      if (provId && apptId) apptByProvider.set(provId, [...(apptByProvider.get(provId) ?? []), apptId])
    }
  }
  const allApptIds = Array.from(new Set(Array.from(apptByProvider.values()).flat()))
  const apptById = new Map<string, any>()
  if (allApptIds.length) {
    const appts = await (prisma as any).customObjectRecord.findMany({ where: { id: { in: allApptIds } } })
    for (const a of appts) apptById.set(a.id, a)
  }

  // One row per appointment (provider cells repeated); a provider with no
  // appointment gets a single row with blank appointment cells.
  const th = 'style="padding:6px 8px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#475569;text-align:left;"'
  const td = 'style="padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;text-align:left;vertical-align:top;"'
  const tdDiv = 'style="padding:5px 8px;border-bottom:1px solid #f1f5f9;border-left:2px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:left;vertical-align:top;"'

  const provCell = (rec: any, p: any, i: number) => `<td ${i === 0 ? td : td}>${esc(cellValue((rec.values ?? {})[p.id], p.type, p.optionLabels))}</td>`
  const apptCell = (rec: any | null, p: any, i: number) => `<td ${i === 0 ? tdDiv : td}>${rec ? esc(cellValue((rec.values ?? {})[p.id], p.type, p.optionLabels)) : ""}</td>`

  let rowCount = 0
  const bodyRows: string[] = []
  for (const prov of providers) {
    const apptIds = apptByProvider.get(prov.id) ?? []
    const rows = apptIds.length ? apptIds.map((id) => apptById.get(id)).filter(Boolean) : [null]
    for (const appt of rows) {
      rowCount++
      const cells = [
        ...provProps.map((p, i) => provCell(prov, p, i)),
        ...apptProps.map((p, i) => apptCell(appt, p, i)),
      ].join("")
      bodyRows.push(`<tr>${cells}</tr>`)
    }
  }

  const groupHeader = `<tr>
    <th ${th} colspan="${provProps.length || 1}" style="padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:12px;color:#0f172a;text-align:left;font-weight:700;">Referring Provider</th>
    <th ${th} colspan="${apptProps.length || 1}" style="padding:6px 8px;border-bottom:2px solid #cbd5e1;border-left:2px solid #e2e8f0;font-size:12px;color:#0f172a;text-align:left;font-weight:700;">Appointment</th>
  </tr>`
  const colHeader = `<tr>
    ${provProps.map((p) => `<th ${th}>${esc(p.name)}</th>`).join("")}
    ${apptProps.map((p, i) => `<th ${i === 0 ? 'style="padding:6px 8px;border-bottom:2px solid #e2e8f0;border-left:2px solid #e2e8f0;font-size:12px;color:#475569;text-align:left;"' : th}>${esc(p.name)}</th>`).join("")}
  </tr>`

  const subject = `New Referring Providers — ${fmtDay(since)} to ${fmtDay(new Date())}`
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:1000px;margin:0 auto;color:#1e293b;">
      <h2 style="color:#0f172a;">New Referring Providers</h2>
      <p style="color:#64748b;font-size:13px;">${providers.length} new referring provider${providers.length === 1 ? "" : "s"} created ${fmtDay(since)} → ${fmtDay(new Date())}, with their appointment information.</p>
      <div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;">${groupHeader}${colHeader}${bodyRows.join("")}</table></div>
      <p style="color:#94a3b8;font-size:11px;margin-top:16px;">Sent from Genesis CRM · Integrations → FilesAnywhere</p>
    </div>`

  return { providerCount: providers.length, rowCount, subject, html }
}

function patchReportConfig(cfg: FaConfig, report: Partial<NonNullable<FaConfig["report"]>>) {
  return (prisma as any).integration.update({
    where: { provider: "filesanywhere" },
    data: { config: { ...cfg, report: { ...(cfg.report ?? { enabled: false, recipients: [], dayOfWeek: 1, hour: 8, lastSentAt: null }), ...report } } },
  })
}

// Build + email the report. Manual sends don't touch lastSentAt (so they can't
// suppress the scheduled send via the schedule guard).
export async function sendFilesanywhereReport(opts: { manual?: boolean } = {}): Promise<{ sent?: number; providerCount?: number; rowCount?: number; skipped?: boolean; message?: string; error?: string }> {
  const integ = await getIntegration("filesanywhere")
  const cfg = (integ?.config ?? {}) as unknown as FaConfig
  const recipients = (cfg.report?.recipients ?? []).filter(Boolean)
  if (!recipients.length) return { error: "No report recipients configured." }
  if (!cfg.providerObjectSlug || !cfg.objectSlug) return { error: "Pick the referring-providers and appointments objects first." }

  const report = await buildProviderReport(cfg)
  if (report.providerCount === 0) return { skipped: true, message: "No new referring providers in the last 7 days — nothing to send." }

  const res = await sendEmail(recipients, report.subject, report.html)
  if (!res.success) return { error: res.error ?? "Email failed to send." }
  if (!opts.manual) await patchReportConfig(cfg, { lastSentAt: new Date().toISOString() }).catch(() => {})
  return { sent: recipients.length, providerCount: report.providerCount, rowCount: report.rowCount }
}
