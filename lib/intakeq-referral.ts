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

// Only intakes from this questionnaire are counted. Matched loosely ("full
// intake") so a year bump in the name doesn't silently drop everything.
export function isTargetQuestionnaire(name: string | null | undefined): boolean {
  return norm(name ?? "").includes("full intake")
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
export function parseIntakeReferral(intake: FullIntake): ParsedIntake | null {
  if (!isTargetQuestionnaire(intake.QuestionnaireName)) return null
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
