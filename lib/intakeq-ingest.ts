import { prisma } from "@/lib/prisma"
import { getIntake, listIntakeSummaries } from "@/lib/intakeq"
import { parseIntakeReferral, isTargetQuestionnaire } from "@/lib/intakeq-referral"

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

  await (prisma as any).intakeReferralResponse.upsert({
    where: { intakeId },
    create: {
      intakeId,
      clientId: intake.ClientId != null ? String(intake.ClientId) : null,
      questionnaireId: intake.QuestionnaireId ?? null,
      questionnaireName: intake.QuestionnaireName ?? null,
      language: parsed.language,
      submittedAt,
      rawAnswer: parsed.rawAnswer,
      category: parsed.category,
    },
    update: {
      language: parsed.language,
      submittedAt,
      rawAnswer: parsed.rawAnswer,
      category: parsed.category,
    },
  })
  return parsed.category
}

// Rate limit is 10 req/min (free tier) — throttle detail calls and cap per run so
// a single serverless invocation stays within the request-rate and time limits.
const BACKFILL_MAX = 25
const THROTTLE_MS = 6500

// Pull submitted target-questionnaire intakes for a date range and ingest the ones
// we don't already have. Bounded per run; returns how many still remain so the
// caller can run again to continue (needed for large historical backfills).
export async function backfillRange(startDate: string, endDate: string): Promise<{ processed: number; remaining: number; candidates: number }> {
  // Candidate ids from the cheap summary endpoint (1 request per 100), filtered to
  // submitted target-questionnaire forms.
  const candidates: string[] = []
  for (let page = 1; page <= 50; page++) {
    const rows = await listIntakeSummaries({ startDate, endDate, page })
    if (!rows.length) break
    for (const r of rows) {
      if (r.DateSubmitted && isTargetQuestionnaire(r.QuestionnaireName)) candidates.push(r.Id)
    }
    if (rows.length < 100) break
  }

  // Skip ones already stored (no detail call needed for those).
  const existing = await (prisma as any).intakeReferralResponse.findMany({
    where: { intakeId: { in: candidates } },
    select: { intakeId: true },
  })
  const have = new Set(existing.map((e: any) => e.intakeId))
  const todo = candidates.filter((id) => !have.has(id))

  const batch = todo.slice(0, BACKFILL_MAX)
  let processed = 0
  for (let i = 0; i < batch.length; i++) {
    try { await ingestIntake(batch[i]); processed++ } catch { /* skip a single bad intake */ }
    if (i < batch.length - 1) await new Promise((r) => setTimeout(r, THROTTLE_MS))
  }
  return { processed, remaining: Math.max(0, todo.length - processed), candidates: candidates.length }
}
