// Pretty, email-safe HTML report for a set of activities (referring-practice
// visits/calls). Inline styles + table layout so it renders in every mail client.

import { fmtActivityWhen } from "@/lib/activity-time"

export interface ReportActivity {
  id: string
  date: string | Date
  practice: { name: string } | null
  location: { name: string; address: string | null } | null
  providers: { doctor: { name: string; title: string | null } }[]
  nextStep: string | null
  frontDesk: string | null
  flyer: string | null // legacy column name — this is the activity "Type"
  notes: string | null
  rating: number | null        // Clinic Value (1 lowest … 6 highest)
  meetingRating: number | null // Meeting Rating (1 lowest … 6 highest)
  tags: { name: string; color?: string | null }[]
  createdBy?: { name: string | null; email: string } | null
}

const BRAND = "#1e3a8a"
const INK = "#0f172a"
const MUTED = "#64748b"
const LINE = "#e2e8f0"

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Activity dates are date-only, stored at UTC midnight (new Date("yyyy-MM-dd")),
// so format them in UTC to show the calendar day the user picked — the same day
// the Activities list shows (activityDay reads the UTC Y/M/D). Formatting in a
// negative-offset zone (America/Chicago) would shift them back a day.
function fmtDate(d: string | Date): string {
  const x = new Date(d)
  return isNaN(x.getTime()) ? "" : x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

// A real timestamp (e.g. "generated at") formatted in the clinic's timezone.
function fmtNow(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

function providerNames(a: ReportActivity): string {
  return a.providers.map((p) => [p.doctor.title, p.doctor.name].filter(Boolean).join(" ")).join(", ")
}

export function buildActivityReportHtml(activities: ReportActivity[], opts: { orgName?: string; generatedBy?: string; message?: string } = {}): string {
  const org = opts.orgName ?? "Genesis Orthopedics & Sports Medicine"
  const dates = activities.map((a) => new Date(a.date).getTime()).filter((t) => !isNaN(t))
  const rangeLabel = dates.length
    ? (() => { const lo = fmtDate(new Date(Math.min(...dates))); const hi = fmtDate(new Date(Math.max(...dates))); return lo === hi ? lo : `${lo} – ${hi}` })()
    : "—"
  const practices = new Set(activities.map((a) => a.practice?.name).filter(Boolean))
  const locations = new Set(activities.map((a) => a.location?.name).filter(Boolean))
  const providers = new Set(activities.flatMap((a) => a.providers.map((p) => p.doctor.name)))

  // Average meeting rating across activities that have one.
  const mrs = activities.map((a) => a.meetingRating).filter((r): r is number => r != null)
  const avgMeetingRating = mrs.length ? (mrs.reduce((s, r) => s + r, 0) / mrs.length).toFixed(1) : null

  // Top tags by frequency (up to 4) for the summary.
  const tagCounts = new Map<string, number>()
  for (const a of activities) for (const t of a.tags) tagCounts.set(t.name, (tagCounts.get(t.name) ?? 0) + 1)
  const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const summaryRow = (label: string, value: string) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:14px;">${esc(label)}</td>
      <td style="padding:11px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:14px;font-weight:600;text-align:right;">${esc(value)}</td>
    </tr>`

  const chip = (name: string, color?: string | null) => {
    const c = color || MUTED
    return `<span style="display:inline-block;font-size:11px;font-weight:600;color:${esc(c)};background:${esc(c)}1a;border:1px solid ${esc(c)}33;border-radius:9999px;padding:2px 8px;margin:0 4px 4px 0;">${esc(name)}</span>`
  }

  const detailRow = (label: string, value: string | null) =>
    value && value.trim()
      ? `<tr><td style="padding:2px 0;color:${MUTED};font-size:12px;width:96px;vertical-align:top;">${esc(label)}</td><td style="padding:2px 0;color:${INK};font-size:13px;">${esc(value)}</td></tr>`
      : ""

  const item = (a: ReportActivity) => `
    <div style="border:1px solid ${LINE};border-radius:12px;padding:16px 18px;margin:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="color:${INK};font-size:15px;font-weight:700;">${esc(a.practice?.name || "Activity")}</td>
          <td style="color:${MUTED};font-size:12px;text-align:right;white-space:nowrap;">${esc(fmtActivityWhen(a.date))}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
        ${detailRow("Type", a.flyer)}
        ${detailRow("Location", a.location?.name ?? null)}
        ${detailRow("Providers", providerNames(a) || null)}
        ${detailRow("Next step", a.nextStep)}
        ${detailRow("Front desk", a.frontDesk)}
        ${detailRow("Clinic Value", a.rating != null ? String(a.rating) : null)}
        ${detailRow("Meeting Rating", a.meetingRating != null ? String(a.meetingRating) : null)}
        ${detailRow("Notes", a.notes)}
      </table>
      ${a.tags.length ? `<div style="margin-top:10px;">${a.tags.map((t) => chip(t.name, t.color)).join("")}</div>` : ""}
    </div>`

  const intro = opts.message && opts.message.trim()
    ? `<p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 20px 0;">${esc(opts.message).replace(/\n/g, "<br/>")}</p>`
    : ""

  return `
  <div style="background:#f1f5f9;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:640px;width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px 32px;text-align:center;">
            <h1 style="margin:0;color:${BRAND};font-size:22px;font-weight:800;">Activity Report</h1>
            <p style="margin:6px 0 0 0;color:${MUTED};font-size:13px;">${esc(org)} &middot; ${esc(rangeLabel)}</p>
          </td></tr>

          <tr><td style="padding:20px 32px 0 32px;">
            ${intro}
            <h2 style="margin:0 0 6px 0;color:${INK};font-size:15px;font-weight:700;text-align:center;">Summary</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:2px solid ${INK};">
              ${summaryRow("Total activities", String(activities.length))}
              ${summaryRow("Date range", rangeLabel)}
              ${summaryRow("Unique practices visited", String(practices.size))}
              ${summaryRow("Unique locations visited", String(locations.size))}
              ${summaryRow("Providers seen", String(providers.size))}
              ${avgMeetingRating ? summaryRow("Avg. meeting rating", String(avgMeetingRating)) : ""}
            </table>
            ${topTags.length ? `<div style="margin-top:14px;text-align:center;">${topTags.map(([n, c]) => chip(`${n} · ${c}`)).join("")}</div>` : ""}
          </td></tr>

          <tr><td style="padding:24px 32px 8px 32px;">
            <h2 style="margin:0 0 14px 0;color:${INK};font-size:15px;font-weight:700;text-align:center;">Activities</h2>
            ${activities.map(item).join("")}
          </td></tr>

          <tr><td style="padding:8px 32px 28px 32px;text-align:center;">
            <p style="margin:0;color:${MUTED};font-size:11px;">Generated ${esc(fmtNow())}${opts.generatedBy ? ` by ${esc(opts.generatedBy)}` : ""} · ${esc(org)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`
}
