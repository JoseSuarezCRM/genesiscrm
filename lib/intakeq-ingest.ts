import { prisma } from "@/lib/prisma"
import { getIntake, listIntakeSummaries, IntakeqRateLimitError, type IntakeSummary } from "@/lib/intakeq"
import { parseIntakeReferral, isTargetQuestionnaire } from "@/lib/intakeq-referral"

// The patient's name from an IntakeQ intake/summary (ClientName, else first+last).
function intakeClientName(intake: Pick<IntakeSummary, "ClientName" | "ClientFirstName" | "ClientLastName">): string | null {
  const full = (intake.ClientName ?? "").trim()
  if (full) return full
  const parts = [intake.ClientFirstName, intake.ClientLastName].map((s) => (s ?? "").trim()).filter(Boolean)
  return parts.length ? parts.join(" ") : null
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

  await (prisma as any).intakeReferralResponse.upsert({
    where: { intakeId },
    create: {
      intakeId,
      clientId: intake.ClientId != null ? String(intake.ClientId) : null,
      clientName,
      questionnaireId: intake.QuestionnaireId ?? null,
      questionnaireName: intake.QuestionnaireName ?? null,
      language: parsed.language,
      submittedAt,
      rawAnswer: parsed.rawAnswer,
      category: parsed.category,
    },
    update: {
      clientName,
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
export async function backfillRange(startDate: string, endDate: string): Promise<{ processed: number; remaining: number; candidates: number; rateLimited: boolean }> {
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
  // Fill names for already-stored rows that don't have one yet — free, from the
  // summary scan (no per-intake detail call).
  for (const e of existing as { intakeId: string; clientName: string | null }[]) {
    if (e.clientName) continue
    const nm = nameById.get(e.intakeId)
    if (nm) await (prisma as any).intakeReferralResponse.update({ where: { intakeId: e.intakeId }, data: { clientName: nm } }).catch(() => {})
  }
  const todo = candidates.filter((id) => !have.has(id))

  const batch = todo.slice(0, BACKFILL_MAX)
  let processed = 0
  for (const id of batch) {
    try {
      await ingestIntake(id); processed++
    } catch (e) {
      // Rate limited → stop and let the caller back off, keeping progress so far.
      if (e instanceof IntakeqRateLimitError) {
        return { processed, remaining: Math.max(0, todo.length - processed), candidates: candidates.length, rateLimited: true }
      }
      // Any other single-intake failure → skip it and keep going.
    }
  }
  return { processed, remaining: Math.max(0, todo.length - processed), candidates: candidates.length, rateLimited: false }
}
