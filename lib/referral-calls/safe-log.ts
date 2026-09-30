/**
 * The only way referral-call code writes to the server log.
 *
 * Everything that passes through the intake is PHI — the pasted page, the
 * screenshot, the model's reply, validation issues (zod echoes the value it
 * rejected), Prisma errors (they echo their arguments). So this logger takes a
 * fixed set of events, each with a fixed set of fields, and every field is a
 * number, a boolean, or a short machine token. There is no parameter a sentence
 * of clinical text could be passed through by accident.
 */

export type ExtractOutcome =
  | "ok" | "refusal" | "truncated" | "invalid_output" | "schema_too_complex"
  | "busy" | "timeout" | "unavailable" | "bad_image" | "bad_request" | "error"

type Token = string

interface Events {
  save_failed: { code: Token }
  extract: {
    outcome: ExtractOutcome
    kind: "text" | "image" | "both"
    ms: number
    status?: number
    stop?: Token
    requestId?: Token
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    fields?: number
    extraFields?: number
    code?: Token
  }
}

const TOKEN = /^[A-Za-z0-9_.:\-]{1,64}$/

export function rcSafeLog<E extends keyof Events>(event: E, fields: Events[E]): void {
  const out: Record<string, number | boolean | string | null> = {}
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    if (v === undefined) continue
    if (typeof v === "number") out[k] = Number.isFinite(v) ? v : null
    else if (typeof v === "boolean" || v === null) out[k] = v
    // A token that doesn't look like one is dropped rather than printed.
    else if (typeof v === "string") out[k] = TOKEN.test(v) ? v : "[redacted]"
  }
  console.info(`[referral-calls] ${event} ${JSON.stringify(out)}`)
}
