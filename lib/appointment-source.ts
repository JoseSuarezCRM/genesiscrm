// Attribution of an IntakeQ referral source onto appointment-style records.
//
// The patient fills the IntakeQ form ON the appointment day or AFTER it, so a
// record is paired with the *nearest following* submission that shares its date of
// birth. Which object/properties this writes to is configured by the admin
// (Integration.config.sourceMapping), so nothing here is hardcoded to a given object.
//
// DATES: no timezone round-trips. A date of birth and an appointment date are plain
// calendar values — we read their y/m/d parts literally and never build a Date from
// them, so nothing can shift them a day. `submittedAt` is a real instant, so it is
// bucketed to the clinic-local (America/Chicago) calendar day via chicagoYmd().

import { prisma } from "@/lib/prisma"
import { getIntegration } from "@/lib/integration-store"
import { chicagoYmd } from "@/lib/intakeq-weeks"

// How many days after the appointment a submission may still belong to it.
export const INTAKE_MATCH_WINDOW_DAYS = 30

export interface SourceMapping {
  objectType: string        // "CO:appointments" (registry key)
  dobPropId: string         // DATE property holding the patient's date of birth
  visitDatePropId: string   // DATE property holding the appointment date
  sourcePropId: string      // property the referral source is written to
  submittedPropId?: string  // optional: stores the matched submission's date
  intakeIdPropId?: string   // optional: stores the matched intakeId (audit)
}

export async function getSourceMapping(): Promise<SourceMapping | null> {
  const row = await getIntegration()
  const m = ((row?.config ?? {}) as any).sourceMapping
  if (!m?.objectType || !m?.dobPropId || !m?.visitDatePropId || !m?.sourcePropId) return null
  return m as SourceMapping
}

// ── Calendar helpers (no Date construction from calendar strings) ────────────

/** Canonical "mm-dd-yyyy" key for any calendar value. Returns "" when unparseable. */
export function dobKey(v: unknown): string {
  if (v == null) return ""
  const s = String(v).trim()
  if (!s) return ""
  const pad = (n: string) => n.padStart(2, "0")
  // ISO / "yyyy-MM-dd" (optionally with a time part) — take the literal date prefix.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[2]}-${m[3]}-${m[1]}`
  // "m/d/yyyy" or "m-d-yyyy"
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return `${pad(m[1])}-${pad(m[2])}-${m[3]}`
  return ""
}

/** "yyyy-mm-dd" for a calendar value, read literally (no timezone math). */
function ymd(v: unknown): string {
  const k = dobKey(v) // mm-dd-yyyy
  if (!k) return ""
  const [mm, dd, yyyy] = k.split("-")
  return `${yyyy}-${mm}-${dd}`
}

/** Whole-day number for a "yyyy-mm-dd" — pure arithmetic on the parts, for differencing only. */
function dayNum(ymdStr: string): number | null {
  const m = ymdStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000)
}

/** A DATE property value → its day number (calendar, literal). */
export function recordDayNum(v: unknown): number | null {
  const s = ymd(v)
  return s ? dayNum(s) : null
}

/** An instant → the clinic-local (Chicago) calendar day number. */
export function instantDayNum(d: Date): number | null {
  return dayNum(chicagoYmd(d))
}

/**
 * Store a calendar date in a DATE property as midday UTC, so it renders as the same
 * day in every viewer timezone (avoids the classic "one day off" display bug).
 */
function dateValueForDay(d: Date): string {
  return `${chicagoYmd(d)}T12:00:00.000Z`
}

// ── Matching ────────────────────────────────────────────────────────────────

export interface AttributionResult {
  scanned: number
  matched: number
  skipped: number
  error?: string
}

interface PairTarget { dob: string; day: number }
interface PairMatch { intakeId: string; submittedAt: Date; category: string }

/**
 * Pair targets (dob + appointment day) with IntakeQ submissions: same DOB, submitted
 * on/after the appointment day within the window, nearest first, one submission per
 * target and one target per submission. Returns targetIndex → match.
 * Shared by the real attribution and the pre-import preview.
 */
export async function pairWithSubmissions(targets: PairTarget[]): Promise<Map<number, PairMatch>> {
  const out = new Map<number, PairMatch>()
  if (!targets.length) return out

  const minDay = Math.min(...targets.map((t) => t.day))
  const since = new Date((minDay - 1) * 86400000)
  const submissions: { intakeId: string; dateOfBirth: string | null; submittedAt: Date; category: string }[] =
    await (prisma as any).intakeReferralResponse.findMany({
      where: { submittedAt: { gte: since } },
      select: { intakeId: true, dateOfBirth: true, submittedAt: true, category: true },
    })

  const byDob = new Map<string, { intakeId: string; day: number; submittedAt: Date; category: string }[]>()
  for (const s of submissions) {
    const k = dobKey(s.dateOfBirth)
    const day = instantDayNum(s.submittedAt)
    if (!k || day == null) continue
    const arr = byDob.get(k) ?? []
    arr.push({ intakeId: s.intakeId, day, submittedAt: s.submittedAt, category: s.category })
    byDob.set(k, arr)
  }

  type Pair = { idx: number; intakeId: string; gap: number; submittedAt: Date; category: string }
  const pairs: Pair[] = []
  targets.forEach((t, idx) => {
    for (const s of byDob.get(t.dob) ?? []) {
      const gap = s.day - t.day
      if (gap >= 0 && gap <= INTAKE_MATCH_WINDOW_DAYS) {
        pairs.push({ idx, intakeId: s.intakeId, gap, submittedAt: s.submittedAt, category: s.category })
      }
    }
  })

  pairs.sort((a, b) => a.gap - b.gap)
  const usedIntake = new Set<string>()
  for (const p of pairs) {
    if (out.has(p.idx) || usedIntake.has(p.intakeId)) continue
    usedIntake.add(p.intakeId)
    out.set(p.idx, { intakeId: p.intakeId, submittedAt: p.submittedAt, category: p.category })
  }
  return out
}

/**
 * Dry run for the reconcile preview: how many of these rows would pick up a referral
 * source, without creating anything. `eligible` = rows that have both a usable DOB
 * and appointment date (the rest can never match).
 */
export async function previewSourceMatches(
  rows: { dob?: string; visitDate?: string }[],
): Promise<{ eligible: number; matched: number; error?: string }> {
  const mapping = await getSourceMapping()
  if (!mapping) return { eligible: 0, matched: 0, error: "No referral-source mapping configured on the IntakeQ integration." }

  const targets: PairTarget[] = []
  for (const r of rows) {
    const dob = dobKey(r.dob)
    const day = recordDayNum(r.visitDate)
    if (dob && day != null) targets.push({ dob, day })
  }
  const paired = await pairWithSubmissions(targets)
  return { eligible: targets.length, matched: paired.size }
}

/**
 * Pair records with IntakeQ submissions and write the referral source.
 * `recordIds` limits the run (e.g. the rows an import just created); omit to sweep
 * every record of the mapped object. `onlyMissing` skips records that already have
 * a source (used by the backfill).
 */
export async function attributeReferralSources(opts: {
  recordIds?: string[]
  onlyMissing?: boolean
} = {}): Promise<AttributionResult> {
  const mapping = await getSourceMapping()
  if (!mapping) return { scanned: 0, matched: 0, skipped: 0, error: "No referral-source mapping configured on the IntakeQ integration." }
  if (!mapping.objectType.startsWith("CO:")) return { scanned: 0, matched: 0, skipped: 0, error: "Referral-source mapping currently supports custom objects only." }

  const def = await (prisma as any).customObjectDef.findUnique({ where: { key: mapping.objectType.slice(3) }, select: { id: true } })
  if (!def) return { scanned: 0, matched: 0, skipped: 0, error: "The mapped object no longer exists." }

  const records: { id: string; values: Record<string, any> }[] = await (prisma as any).customObjectRecord.findMany({
    where: { objectDefId: def.id, ...(opts.recordIds?.length ? { id: { in: opts.recordIds } } : {}) },
    select: { id: true, values: true },
  })

  // Candidate records: have a DOB + appointment date, and (optionally) no source yet.
  const targets = records
    .map((r) => ({
      id: r.id,
      values: (r.values ?? {}) as Record<string, any>,
      dob: dobKey((r.values ?? {})[mapping.dobPropId]),
      day: recordDayNum((r.values ?? {})[mapping.visitDatePropId]),
    }))
    .filter((r) => r.dob && r.day != null)
    .filter((r) => !opts.onlyMissing || !String(r.values[mapping.sourcePropId] ?? "").trim())

  if (targets.length === 0) return { scanned: records.length, matched: 0, skipped: records.length }

  const paired = await pairWithSubmissions(targets.map((t) => ({ dob: t.dob, day: t.day! })))
  let matched = 0

  for (const [idx, m] of Array.from(paired.entries())) {
    const t = targets[idx]
    const next: Record<string, any> = { ...t.values, [mapping.sourcePropId]: m.category }
    if (mapping.submittedPropId) next[mapping.submittedPropId] = dateValueForDay(m.submittedAt)
    if (mapping.intakeIdPropId) next[mapping.intakeIdPropId] = m.intakeId

    await (prisma as any).customObjectRecord.update({ where: { id: t.id }, data: { values: next } }).catch(() => {})
    matched++
  }

  return { scanned: records.length, matched, skipped: targets.length - matched }
}
