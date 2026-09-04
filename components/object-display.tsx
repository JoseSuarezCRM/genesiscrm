"use client"

// Rendering a custom-object property value — shared by the table, board cards and
// calendar so the same property looks the same everywhere.

import type { ReactNode } from "react"
import { OptionValue } from "@/components/option-value"
import { formatNumber } from "@/lib/number-format"
import type { ObjectProperty } from "@/lib/object-columns"

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * A calendar day read from its literal y/m/d parts — never rebuilt as a Date.
 * Date properties are stored in more than one shape (ISO from the app, "12/08/2026"
 * from imports), and either one put through `new Date()` can land a day off once the
 * viewer's timezone and the display timezone disagree.
 */
function literalDay(v: string): string | null {
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T([\d:.]+)Z?)?$/)
  if (iso) {
    // A real time of day means it's a timestamp, not a calendar date — let Date handle it.
    if (iso[4] && !/^00:00|^12:00/.test(iso[4])) return null
    return `${MONTH_ABBR[Number(iso[2]) - 1]} ${Number(iso[3])}, ${iso[1]}`
  }
  const us = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (us) return `${MONTH_ABBR[Number(us[1]) - 1]} ${Number(us[2])}, ${us[3]}`
  return null
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  if (typeof d === "string") {
    const lit = literalDay(d.trim())
    if (lit) return lit
  }
  const parsed = new Date(d)
  if (isNaN(parsed.getTime())) return String(d)
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

export function displayValue(p: ObjectProperty | undefined, v: any, userMap: Record<string, string>): string {
  if (!p) return "—"
  if (v === null || v === undefined || v === "") return "—"
  switch (p.type) {
    case "CHECKBOX": return v ? "Yes" : "No"
    case "NUMBER": return formatNumber(v, (p as any).numberFormat)
    case "DATE": return fmtDate(v)
    case "DATE_TIME": return v ? new Date(v).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"
    case "DROPDOWN": { const l = (p as any).optionLabels as Record<string, string> | undefined; return l?.[String(v)] ?? String(v) }
    case "MULTI_SELECT": { const l = (p as any).optionLabels as Record<string, string> | undefined; return Array.isArray(v) ? v.map((x) => l?.[String(x)] ?? String(x)).join(", ") : String(v) }
    case "USER": return userMap[v] ?? String(v)
    default: return String(v)
  }
}

/** Styled cell (dot/badge for dropdowns); falls back to displayValue's text. */
export function displayCell(p: ObjectProperty | undefined, v: any, userMap: Record<string, string>): ReactNode {
  if (!p) return "—"
  if ((p.type === "DROPDOWN" || p.type === "MULTI_SELECT") && v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
    return <OptionValue value={v} optionLabels={(p as any).optionLabels} optionColors={(p as any).optionColors} optionStyle={(p as any).optionStyle} />
  }
  return displayValue(p, v, userMap)
}

// ── Relative dates ───────────────────────────────────────────────────────────
// Board cards read "Event Date: 11/04/2026 (61 days from now)" and
// "Email a day ago". Both work off whole days, and a calendar value is read from its
// literal y/m/d parts — never rebuilt as a Date, which is what shifts it a day.

function dayNumOf(v: unknown): number | null {
  const s = String(v ?? "").trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return Math.floor(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / 864e5)
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (us) return Math.floor(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])) / 864e5)
  const d = new Date(v as any)
  return isNaN(d.getTime()) ? null : Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)
}

function todayDayNum(): number {
  const n = new Date()
  return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 864e5)
}

/** "61 days from now" / "3.4 months from now" / "12 days ago" / "today". */
export function relativeDay(v: unknown): string {
  const day = dayNumOf(v)
  if (day == null) return ""
  const diff = day - todayDayNum()
  if (diff === 0) return "today"
  const ahead = diff > 0
  const n = Math.abs(diff)
  const amount = n < 45 ? `${n} day${n === 1 ? "" : "s"}`
    : n < 365 ? `${(n / 30.44).toFixed(1)} months`
    : `${(n / 365.25).toFixed(1)} years`
  return ahead ? `${amount} from now` : `${amount} ago`
}

/** "6 hours ago" / "a day ago" / "18 days ago" — for the last-activity line. */
export function relativeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ""
  const mins = Math.floor((Date.now() - t) / 6e4)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return "a day ago"
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30.44)
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`
  const years = Math.floor(days / 365.25)
  return `${years} year${years === 1 ? "" : "s"} ago`
}

/** "Xd in stage" for the board's time-in-stage indicator. */
export function timeInStage(enteredAt: string | null): string {
  if (!enteredAt) return ""
  const ms = Date.now() - new Date(enteredAt).getTime()
  const days = Math.floor(ms / 864e5)
  if (days >= 1) return `${days}d in stage`
  const hrs = Math.floor(ms / 36e5)
  if (hrs >= 1) return `${hrs}h in stage`
  return `${Math.max(1, Math.floor(ms / 6e4))}m in stage`
}
