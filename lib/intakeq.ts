// Minimal IntakeQ API v1 client. Auth via the X-Auth-Key header. Docs:
// https://support.intakeq.com/article/251-intakeq-questionnaire-api
// The API key is a server-only secret (INTAKEQ_API_KEY) — never sent to the client.

import { getIntakeqApiKey } from "@/lib/integration-store"
import { logIntegrationEvent } from "@/lib/integration-log"

const BASE = "https://intakeq.com/api/v1"

// Re-exported so existing callers keep importing config state from here.
export { isIntakeqConfigured } from "@/lib/integration-store"

// Thrown on HTTP 429 so callers can back off instead of failing the whole run.
export class IntakeqRateLimitError extends Error {
  constructor() { super("IntakeQ rate limit (10 requests/min) reached.") }
}

// Free tier = 10 requests/min. Keep ≥7s between ANY two requests within a single
// serverless invocation so summary pages + detail calls share one budget.
let lastRequestAt = 0
const MIN_GAP_MS = 7000
async function throttle() {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()
}

// Endpoint for logging, without the query string or a specific intake id (so we
// don't store tokens or patient-identifying ids in the activity log).
function logEndpoint(path: string): string {
  return path.split("?")[0].replace(/\/intakes\/[0-9a-fA-F-]{8,}/, "/intakes/:id")
}

async function iq<T>(path: string): Promise<T> {
  const key = await getIntakeqApiKey()
  if (!key) throw new Error("IntakeQ isn't connected — add an API key in Settings → Integrations.")
  await throttle()
  const started = Date.now()
  const endpoint = logEndpoint(path)
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Key": key }, cache: "no-store" })
  } catch (netErr: any) {
    await logIntegrationEvent({ kind: "api", method: "GET", endpoint, ok: false, message: netErr?.message ?? "network error", durationMs: Date.now() - started })
    throw netErr
  }
  await logIntegrationEvent({ kind: "api", method: "GET", endpoint, status: res.status, ok: res.ok, durationMs: Date.now() - started, message: res.ok ? null : `HTTP ${res.status}` })
  if (res.status === 429) throw new IntakeqRateLimitError()
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`IntakeQ ${path} → ${res.status} ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface IntakeSummary {
  Id: string
  ClientId?: number
  ClientName?: string
  ClientFirstName?: string
  ClientLastName?: string
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
