import { prisma } from "@/lib/prisma"
import { getIntake, listIntakeSummaries, IntakeqRateLimitError, type IntakeSummary } from "@/lib/intakeq"
import { parseIntakeReferral, isTargetQuestionnaire } from "@/lib/intakeq-referral"

// The patient's name from an IntakeQ intake/summary. IntakeQ isn't consistent
// about where the name lives (and the summary endpoint may omit it entirely), so
// check the common fields on both the summary and the full-intake detail.
function intakeClientName(intake: Record<string, any>): string | null {
  const s = (v: unknown) => (v == null ? "" : String(v).trim())
  const direct = s(intake.ClientName) || s(intake.Name) || s(intake.ClientFullName) || s(intake.FullName) || s(intake?.Client?.Name)
  if (direct) return direct
  const first = s(intake.ClientFirstName) || s(intake.FirstName) || s(intake?.Client?.FirstName)
  const last = s(intake.ClientLastName) || s(intake.LastName) || s(intake?.Client?.LastName)
  const joined = [first, last].filter(Boolean).join(" ")
  return joined || null
}

// The patient's date of birth as "yyyy-MM-dd". IntakeQ may send it as a Unix
// timestamp (seconds or ms), an ISO/US date string, or only as a "Date of Birth"
// answer in the questionnaire — so check the common client fields first, then the
// questions. Defensive like intakeClientName since the payload shape varies.
function intakeClientDob(intake: Record<string, any>): string | null {
  const pad = (n: number) => String(n).padStart(2, "0")
  const norm = (v: unknown): string | null => {
    if (v == null || v === "") return null
    if (typeof v === "number") {
      const ms = v < 1e12 ? v * 1000 : v
      const d = new Date(ms)
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    const str = String(v).trim()
    if (/^\d{10,13}$/.test(str)) return norm(Number(str))
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (us) return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const direct = norm(
    intake.ClientDateOfBirth ?? intake.DateOfBirth ?? intake.ClientDOB ??
    intake.ClientBirthDate ?? intake?.Client?.DateOfBirth ?? intake?.Client?.DOB,
  )
  if (direct) return direct
  const qs = Array.isArray(intake.Questions) ? intake.Questions : []
  const q = qs.find((x: any) => /date of birth|(^|\W)dob(\W|$)|birth\s*date/i.test(String(x?.Text ?? "")))
  return q?.Answer ? norm(q.Answer) : null
}

// Fetch one intake, categorize its referral answer, and upsert it (idempotent by
// intakeId, so webhook re-deliveries and backfill overlap don't double-count).
// Returns the stored category, or null if the intake isn't a target form.
export async function ingestIntake(intakeId: string): Promise<string | null> {
  const intake = await getIntake(intakeId)
  const parsed = parseIntakeReferral(intake)
  if (!parsed) return null

  const submittedAt = intake.DateSubmitted
    ? new Date(intake.DateSubmitted)
    : intake.DateCreated ? new Date(intake.DateCreated) : new Date()

  const clientName = intakeClientName(intake)
  const dateOfBirth = intakeClientDob(intake)

  await (prisma as any).intakeReferralResponse.upsert({
    where: { intakeId },
    create: {
      intakeId,
      clientId: intake.ClientId != null ? String(intake.ClientId) : null,
      clientName,
      dateOfBirth,
      questionnaireId: intake.QuestionnaireId ?? null,
      questionnaireName: intake.QuestionnaireName ?? null,
      language: parsed.language,
      submittedAt,
      rawAnswer: parsed.rawAnswer,
      category: parsed.category,
    },
    update: {
      clientName,
      // Only overwrite DOB when we found one (don't clobber a stored value with null).
      ...(dateOfBirth ? { dateOfBirth } : {}),
      language: parsed.language,
      submittedAt,
      rawAnswer: parsed.rawAnswer,
      category: parsed.category,
    },
  })
  return parsed.category
}

// The IntakeQ client throttles every request to ~7s (10/min limit), so a run is
// bounded by the serverless time budget. A smaller batch also lets Stop take
// effect sooner (it's honored between batches).
const BACKFILL_MAX = 12

// Pull submitted target-questionnaire intakes for a date range and ingest the ones
// we don't already have. Bounded per run; returns how many still remain (so the
// caller can run again) plus a rateLimited flag so the caller can back off.
export async function backfillRange(
  startDate: string,
  endDate: string,
  opts: { budgetMs?: number; max?: number } = {},
): Promise<{ processed: number; remaining: number; candidates: number; rateLimited: boolean }> {
  // How many to ingest this call: an explicit max, else the whole time budget
  // (server-side drain), else the small default (a single UI/cron batch).
  const max = opts.max ?? (opts.budgetMs ? Number.POSITIVE_INFINITY : BACKFILL_MAX)
  const startedAt = Date.now()
  // Candidate ids from the summary endpoint (1 request per 100 rows), filtered to
  // submitted target-questionnaire forms.
  const candidates: string[] = []
  const nameById = new Map<string, string>()
  try {
    for (let page = 1; page <= 50; page++) {
      const rows = await listIntakeSummaries({ startDate, endDate, page })
      if (!rows.length) break
      for (const r of rows) {
        if (r.DateSubmitted && isTargetQuestionnaire(r.QuestionnaireName)) {
          candidates.push(r.Id)
          const nm = intakeClientName(r)
          if (nm) nameById.set(r.Id, nm)
        }
      }
      if (rows.length < 100) break
    }
  } catch (e) {
    if (e instanceof IntakeqRateLimitError) return { processed: 0, remaining: 1, candidates: candidates.length, rateLimited: true }
    throw e
  }

  // Skip ones already stored (no detail call needed for those).
  const existing = await (prisma as any).intakeReferralResponse.findMany({
    where: { intakeId: { in: candidates } },
    select: { intakeId: true, clientName: true },
  })
  const have = new Set(existing.map((e: any) => e.intakeId))
  // Cheap name fill from the summary (free) for stored rows missing a name — only
  // helps if the summary carries the name (some accounts don't).
  const filledFromSummary = new Set<string>()
  for (const e of existing as { intakeId: string; clientName: string | null }[]) {
    if (e.clientName != null) continue
    const nm = nameById.get(e.intakeId)
    if (nm) { await (prisma as any).intakeReferralResponse.update({ where: { intakeId: e.intakeId }, data: { clientName: nm } }).catch(() => {}); filledFromSummary.add(e.intakeId) }
  }

  // Work items: intakes to ingest (not stored yet) + stored rows still missing a
  // name (fetch the full-intake detail, which reliably carries the client's name).
  const unstored = candidates.filter((id) => !have.has(id))
  const nameless = (existing as { intakeId: string; clientName: string | null }[])
    .filter((e) => e.clientName == null && !filledFromSummary.has(e.intakeId))
    .map((e) => e.intakeId)
  const work: { id: string; kind: "ingest" | "name" }[] = [
    ...unstored.map((id) => ({ id, kind: "ingest" as const })),
    ...nameless.map((id) => ({ id, kind: "name" as const })),
  ]

  let processed = 0
  for (const w of work) {
    if (processed >= max) break
    if (opts.budgetMs && Date.now() - startedAt >= opts.budgetMs) break
    try {
      if (w.kind === "ingest") {
        await ingestIntake(w.id)
      } else {
        const intake = await getIntake(w.id)
        const nm = intakeClientName(intake as any)
        // Store "" when the detail has no name, so it's marked tried and not re-fetched.
        await (prisma as any).intakeReferralResponse.update({ where: { intakeId: w.id }, data: { clientName: nm || "" } }).catch(() => {})
      }
      processed++
    } catch (e) {
      // Rate limited → stop and let the caller back off, keeping progress so far.
      if (e instanceof IntakeqRateLimitError) {
        return { processed, remaining: Math.max(0, work.length - processed), candidates: candidates.length, rateLimited: true }
      }
      // Any other single-item failure → skip it and keep going.
    }
  }
  return { processed, remaining: Math.max(0, work.length - processed), candidates: candidates.length, rateLimited: false }
}
