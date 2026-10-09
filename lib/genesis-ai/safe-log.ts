/**
 * The only way Genesis AI writes to the server log.
 *
 * Questions, tool results and answers are all PHI. So, like the on-call intake
 * (lib/referral-calls/safe-log.ts), this logger takes one fixed event whose
 * fields are numbers, booleans or short machine tokens — there is no parameter a
 * sentence of patient text could be passed through by accident.
 */

export type ChatOutcome =
  | "ok" | "refusal" | "truncated" | "tool_limit" | "aborted"
  | "busy" | "timeout" | "unavailable" | "bad_request" | "error"

type Token = string

interface Fields {
  outcome: ChatOutcome
  ms: number
  rounds: number
  tools: number
  toolErrors: number
  status?: number
  stop?: Token
  requestId?: Token
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

const TOKEN = /^[A-Za-z0-9_.:\-]{1,64}$/

export function aiSafeLog(fields: Fields): void {
  const out: Record<string, number | boolean | string | null> = {}
  for (const [k, v] of Object.entries(fields as unknown as Record<string, unknown>)) {
    if (v === undefined) continue
    if (typeof v === "number") out[k] = Number.isFinite(v) ? v : null
    else if (typeof v === "boolean" || v === null) out[k] = v
    // A token that doesn't look like one is dropped rather than printed.
    else if (typeof v === "string") out[k] = TOKEN.test(v) ? v : "[redacted]"
  }
  console.info(`[genesis-ai] chat ${JSON.stringify(out)}`)
}
