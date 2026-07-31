// Minimal IntakeQ API v1 client. Auth via the X-Auth-Key header. Docs:
// https://support.intakeq.com/article/251-intakeq-questionnaire-api
// The API key is a server-only secret (INTAKEQ_API_KEY) — never sent to the client.

const BASE = "https://intakeq.com/api/v1"

function apiKey(): string {
  const k = process.env.INTAKEQ_API_KEY
  if (!k) throw new Error("INTAKEQ_API_KEY is not set")
  return k
}

export function isIntakeqConfigured(): boolean {
  return !!process.env.INTAKEQ_API_KEY
}

async function iq<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-Auth-Key": apiKey() },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`IntakeQ ${path} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface IntakeSummary {
  Id: string
  ClientId?: number
  Status: string
  DateCreated: number
  DateSubmitted: number | null
  QuestionnaireName: string
  QuestionnaireId: string
}

export interface IntakeQuestion {
  Id: string
  Text: string
  Answer: string | null
  QuestionType: string
  Rows?: { Text: string; Answers: string[] }[]
}

export interface FullIntake extends IntakeSummary {
  Questions: IntakeQuestion[]
}

export interface QuestionnaireTemplate { Id: string; Name: string; Archived: boolean }

// Submitted intake summaries in a date range (max 100 per page; use page to page).
export function listIntakeSummaries(params: { startDate?: string; endDate?: string; page?: number }): Promise<IntakeSummary[]> {
  const q = new URLSearchParams()
  if (params.startDate) q.set("startDate", params.startDate)
  if (params.endDate) q.set("endDate", params.endDate)
  q.set("page", String(params.page ?? 1))
  return iq<IntakeSummary[]>(`/intakes/summary?${q.toString()}`)
}

export function getIntake(id: string): Promise<FullIntake> {
  return iq<FullIntake>(`/intakes/${encodeURIComponent(id)}`)
}

export function listQuestionnaires(): Promise<QuestionnaireTemplate[]> {
  return iq<QuestionnaireTemplate[]>(`/questionnaires`)
}
