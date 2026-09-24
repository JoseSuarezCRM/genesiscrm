import type { FullIntake } from "@/lib/intakeq"

// The referral-source categories tracked on the weekly report (English labels,
// matching the spreadsheet rows). Both the English and Spanish answer options
// fold into these — that's the "sum EN + ES" step, done automatically.
export const REFERRAL_CATEGORIES = [
  "Physician",
  "I'm a Previous Patient",
  "Insurance Provider",
  "Zoc Doc",
  "Google",
  "Family Or Family Member",
  "Genesis website",
  "Hospital Emergency Room",
  "Social Media",
  "School",
  "Urgent or Immediate Care",
  "Radio",
  "Friend",
  "TV Ad",
  "Webinar",
  "Next Door",
  "Buoy Health",
] as const

export const UNMAPPED = "Unmapped"
export const UNANSWERED = "Unanswered"

// Which IntakeQ forms get ingested, as loose name fragments — a year bump in the
// name ("GOSM 2026 Full Intake" → 2027) must not silently drop everything. Admins
// can override this list in Settings; this is the fallback.
export const DEFAULT_INTAKE_FORMS = ["full intake", "fd/admin"] as const

// The report's default selection: every form that was ingested.
//
// It applies no name filter at all, which is the point — anything in
// IntakeReferralResponse is by definition a form we chose to ingest, so "all
// ingested" and "everything stored" are the same set. There is no form name
// written down anywhere in the report path, so renaming the IntakeQ form can
// never silently zero the report while ingestion keeps working.
//
// This replaced a hardcoded `REPORT_FORM = "Full Intake"`, which is why 118
// FD/admin submissions were stored but invisible for a fortnight.
export const ALL_FORMS = "all"

// Is this form one we ingest? Fragments are normalised the same way as the name, so
// "FD/admin" matches "FD/Admin", "FD - Admin" and so on.
export function isTargetQuestionnaire(
  name: string | null | undefined,
  forms: readonly string[] = DEFAULT_INTAKE_FORMS,
): boolean {
  const n = norm(name ?? "")
  if (!n) return false
  return forms.some((f) => {
    const frag = norm(f)
    return !!frag && n.includes(frag)
  })
}

/**
 * Does this stored form name belong to the report's current selection?
 *
 * Uses `isTargetQuestionnaire` — the same matcher ingestion gates on — so the
 * report can never disagree with the Forms-to-ingest list about what counts. A
 * raw SQL `contains` would be a *second* matcher: the configured fragments are
 * normalised-loose, so `fd/admin` becomes `fd admin` and plain substring
 * matching would miss a form legitimately written as "FD - Admin".
 *
 * Filtering happens in JS rather than SQL. There is no index on
 * `questionnaireName`, so a SQL predicate would be evaluated row by row anyway
 * after the `submittedAt` index scan — and don't add one: two distinct values
 * across ~2,000 rows is selectivity Postgres would ignore.
 */
export function matchesReportForm(
  name: string | null | undefined,
  selection: string,
): boolean {
  if (!selection || selection === ALL_FORMS) return true
  return isTargetQuestionnaire(name, [selection])
}

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// The referral-source question, English or Spanish wording.
function isReferralQuestion(text: string): boolean {
  const t = norm(text)
  return t.includes("how were you referred") || t.includes("referred to our office") ||
    t.includes("como fue referido") || t.includes("referido a nuestra oficina")
}

function isSpanishQuestion(text: string): boolean {
  const t = norm(text)
  return t.includes("como fue referido") || t.includes("referido a nuestra oficina")
}

// Ordered option → category rules (first keyword hit wins). Keywords are accent-
// stripped substrings covering the English AND Spanish option labels. Order
// matters where labels share words (e.g. "zoc doc" before "doctor").
const RULES: { category: string; keywords: string[] }[] = [
  { category: "Zoc Doc",                  keywords: ["zoc"] },
  { category: "Buoy Health",              keywords: ["buoy"] },
  { category: "Next Door",                keywords: ["next door", "nextdoor"] },
  { category: "Genesis website",          keywords: ["genesis"] },
  { category: "Hospital Emergency Room",  keywords: ["emergency", "emergencias", "sala de emergencia"] },
  { category: "Urgent or Immediate Care", keywords: ["urgent", "immediate care", "urgencias"] },
  { category: "Insurance Provider",       keywords: ["insurance", "seguro"] },
  { category: "I'm a Previous Patient",   keywords: ["previous patient", "paciente anterior"] },
  { category: "Family Or Family Member",  keywords: ["family", "familia"] },
  { category: "Social Media",             keywords: ["social media", "redes sociales", "social"] },
  { category: "Google",                   keywords: ["google"] },
  { category: "School",                   keywords: ["school", "escuela"] },
  { category: "Radio",                    keywords: ["radio"] },
  { category: "Friend",                   keywords: ["friend", "amigo"] },
  { category: "TV Ad",                    keywords: ["tv ad", "anuncio de television", "television"] },
  { category: "Webinar",                  keywords: ["webinar", "seminario"] },
  { category: "Physician",                keywords: ["physician", "doctor", "medico"] },
]

export function categorize(answer: string | null | undefined): string {
  const a = norm(answer ?? "")
  if (!a || a === "unanswered") return UNANSWERED
  for (const r of RULES) if (r.keywords.some((k) => a.includes(k))) return r.category
  return UNMAPPED
}

export interface ParsedIntake {
  category: string
  language: "EN" | "ES" | null
  rawAnswer: string | null
}

// Extract the referral-source answer from a full intake, or null if this intake
// isn't from the target questionnaire (so it's ignored entirely).
export function parseIntakeReferral(
  intake: FullIntake,
  forms: readonly string[] = DEFAULT_INTAKE_FORMS,
): ParsedIntake | null {
  if (!isTargetQuestionnaire(intake.QuestionnaireName, forms)) return null
  const questions = (intake.Questions ?? []).filter((q) => isReferralQuestion(q.Text))
  // The form shows an English and a Spanish block; only the chosen language's
  // question carries an answer.
  const answered = questions.find((q) => {
    const a = norm(q.Answer ?? "")
    return a && a !== "unanswered"
  })
  const q = answered ?? questions[0]
  const rawAnswer = q?.Answer?.trim() || null
  const language: "EN" | "ES" | null = q ? (isSpanishQuestion(q.Text) ? "ES" : "EN") : null
  return { category: categorize(rawAnswer), language, rawAnswer }
}
