/**
 * POST /api/genesis-ai/chat — one question to Genesis AI, answered as a stream.
 *
 * Body: { conversationId?: string, message: string }
 * Response: newline-delimited JSON events —
 *   { t: "conversation", id, title }   which chat this is (a new one is created)
 *   { t: "text", d }                    answer text, as it's written
 *   { t: "tool", id, status }           a lookup started
 *   { t: "tool_done", id, status, error } a lookup finished
 *   { t: "action", id, card }           a proposed change, waiting for Confirm
 *   { t: "notice", d }                  a refusal, a cut-off answer, …
 *   { t: "error", message }             the question failed
 *   { t: "done" }                       always last
 *
 * PHI handling, all deliberate:
 * - The model reads the CRM only through lib/genesis-ai/tools.ts, which acts as
 *   the person asking (lib/genesis-ai/access.ts).
 * - First-party Messages API only, no beta features, no Files or Batch API. Only
 *   the static, PHI-free prefix (tools + rules) is cached.
 * - Nothing from the question, the data or the answer is logged; the server log
 *   and the audit entry hold metadata only (lib/genesis-ai/safe-log.ts).
 * - The chat is stored for its owner alone and deleted after 30 days.
 */
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { getAnthropicClient } from "@/lib/anthropic"
import { checkRateLimit } from "@/lib/rate-limit"
import { createAuditLog } from "@/lib/audit"
import { ALL_TOOL_DEFINITIONS, runAnyTool } from "@/lib/genesis-ai/tools"
import { GENESIS_MODEL, systemFor } from "@/lib/genesis-ai/prompt"
import { aiSafeLog, type ChatOutcome } from "@/lib/genesis-ai/safe-log"
import { appendTurns, createConversation, loadHistory, ownConversation } from "@/lib/genesis-ai/conversation"
import type { Viewer } from "@/lib/genesis-ai/access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const MAX_TOKENS = 16_000
/** Lookup rounds per question; the last round must answer with what it has. */
const MAX_ROUNDS = 8
const RATE_LIMIT = 60 // questions per person per 15 minutes

const Body = z.object({
  conversationId: z.string().min(1).max(64).optional(),
  message: z.string().trim().min(1).max(4000),
}).strict()

const STARTING: Record<string, string> = {
  list_objects: "Checking what you can access…",
  describe_object: "Reading the fields…",
  find_records: "Searching records…",
  query_records: "Listing records…",
  aggregate: "Crunching the numbers…",
  get_record: "Opening the record…",
  propose_update_records: "Preparing the change…",
  propose_create_record: "Preparing the new record…",
  propose_add_note: "Preparing the note…",
  propose_delete_records: "Preparing the deletion…",
  propose_link_records: "Preparing the link…",
  propose_create_segment: "Preparing the segment…",
  propose_create_report: "Preparing the report…",
  propose_create_view: "Preparing the view…",
}

type Param = Anthropic.Messages.MessageParam

export async function POST(req: Request) {
  const session = await auth()
  const u = session?.user as any
  if (!u?.id) return Response.json({ error: "Please sign in again." }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Genesis AI isn't set up yet." }, { status: 503 })

  const me: Viewer = { id: u.id, name: u.name || u.email || "the user", role: u.role ?? "STAFF", permissions: u.permissions ?? [] }
  if (!checkRateLimit(`genesis-ai:${me.id}`, RATE_LIMIT).allowed) {
    return Response.json({ error: "That's a lot of questions in a short time. Try again in a few minutes." }, { status: 429 })
  }

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    // Never echo the body: it's the question.
    return Response.json({ error: "That question couldn't be read." }, { status: 400 })
  }

  const conv = body.conversationId
    ? await ownConversation(me.id, body.conversationId)
    : await createConversation(me.id, body.message)
  if (!conv) return Response.json({ error: "That chat no longer exists." }, { status: 404 })

  await appendTurns(me.id, conv.id, [{ role: "user", content: [{ type: "text", text: body.message }] }])
  const messages: Param[] = await loadHistory(me.id, conv.id)

  // Stop the model as soon as the person presses Stop or leaves.
  const abort = new AbortController()
  req.signal.addEventListener("abort", () => abort.abort())
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")) } catch { /* the reader is gone */ }
      }
      send({ t: "conversation", id: conv.id, title: conv.title })

      const started = Date.now()
      const client = getAnthropicClient()
      const system = systemFor(me)
      let outcome: ChatOutcome = "ok"
      let rounds = 0, toolCalls = 0, toolErrors = 0
      let inputTokens = 0, outputTokens = 0, cacheRead = 0, cacheWrite = 0
      let stop: string | undefined, requestId: string | undefined, status: number | undefined
      const objectsRead = new Set<string>()
      const recordsOpened: string[] = []
      const toolsUsed: string[] = []

      try {
        while (true) {
          if (abort.signal.aborted) { outcome = "aborted"; break }
          rounds++
          const lastRound = rounds >= MAX_ROUNDS
          const s = client.messages.stream({
            model: GENESIS_MODEL,
            max_tokens: MAX_TOKENS,
            system,
            tools: ALL_TOOL_DEFINITIONS,
            messages,
            output_config: { effort: "medium" },
            // Out of lookups: answer with what's been found.
            ...(lastRound ? { tool_choice: { type: "none" as const } } : {}),
          } as any, { signal: abort.signal })

          for await (const ev of s) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send({ t: "text", d: ev.delta.text })
          }
          const msg = await s.finalMessage()
          requestId = (msg as any)._request_id ?? requestId
          stop = msg.stop_reason ?? undefined
          inputTokens += msg.usage.input_tokens ?? 0
          outputTokens += msg.usage.output_tokens ?? 0
          cacheRead += msg.usage.cache_read_input_tokens ?? 0
          cacheWrite += msg.usage.cache_creation_input_tokens ?? 0

          if (msg.stop_reason === "refusal") {
            // Not saved: the question stays unanswered in the history.
            outcome = "refusal"
            send({ t: "notice", d: "Genesis AI can't help with that request." })
            break
          }
          const toolUses = msg.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use")
          if (msg.stop_reason === "max_tokens") {
            outcome = "truncated"
            // A cut-off lookup is never run; a cut-off answer is kept as far as it got.
            if (!toolUses.length) await appendTurns(me.id, conv.id, [{ role: "assistant", content: msg.content as any }])
            send({ t: "notice", d: "The answer was cut short. Try asking for less at once." })
            break
          }
          if (!toolUses.length) {
            await appendTurns(me.id, conv.id, [{ role: "assistant", content: msg.content as any }])
            break
          }

          const results: Anthropic.Messages.ToolResultBlockParam[] = []
          for (const tu of toolUses) {
            toolCalls++
            send({ t: "tool", id: tu.id, status: STARTING[tu.name] ?? "Looking something up…" })
            // A propose_* tool only stores a proposal; nothing changes until the
            // person clicks Confirm on its card (confirmGenesisAction).
            const out = await runAnyTool(tu.name, tu.input, me, { conversationId: conv.id, toolUseId: tu.id })
            if (out.isError) toolErrors++
            toolsUsed.push(tu.name)
            out.objects.forEach((o) => objectsRead.add(o))
            for (const r of out.recordIds) if (recordsOpened.length < 50 && !recordsOpened.includes(r)) recordsOpened.push(r)
            send({ t: "tool_done", id: tu.id, status: out.status, error: !!out.isError })
            if (out.action) send({ t: "action", id: out.action.id, card: out.action.card })
            results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content, ...(out.isError ? { is_error: true } : {}) })
          }
          const turns: Param[] = [{ role: "assistant", content: msg.content as any }, { role: "user", content: results }]
          // The lookup and its results are saved together, so the history is never
          // left with a lookup that has no answer.
          await appendTurns(me.id, conv.id, turns)
          messages.push(...turns)
          if (lastRound) { outcome = "tool_limit"; break }
        }
      } catch (e) {
        if (abort.signal.aborted || e instanceof Anthropic.APIUserAbortError) {
          outcome = "aborted"
        } else {
          const m = mapError(e)
          outcome = m.outcome
          status = (e as any)?.status
          send({ t: "error", message: m.message })
        }
      } finally {
        send({ t: "done" })
        try { controller.close() } catch { /* already closed */ }
        aiSafeLog({
          outcome, ms: Date.now() - started, rounds, tools: toolCalls, toolErrors, status, stop, requestId,
          inputTokens, outputTokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
        })
        // Metadata only — never the question, the data or the answer.
        await createAuditLog({
          userId: me.id,
          action: "AI_ASSISTANT",
          resourceType: "AiConversation",
          resourceId: conv.id,
          metadata: {
            model: GENESIS_MODEL, outcome, ms: Date.now() - started, rounds, tools: toolsUsed,
            objects: Array.from(objectsRead), recordsOpened, inputTokens, outputTokens,
            cacheReadTokens: cacheRead, requestId: requestId ?? null,
          },
        })
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}

function mapError(e: unknown): { outcome: ChatOutcome; message: string } {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { outcome: "timeout", message: "Genesis AI took too long to answer. Try a narrower question." }
  if (e instanceof Anthropic.APIConnectionError) return { outcome: "unavailable", message: "Genesis AI couldn't be reached. Try again in a moment." }
  if (e instanceof Anthropic.RateLimitError) return { outcome: "busy", message: "Genesis AI is busy right now. Try again in a minute." }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return { outcome: "unavailable", message: "Genesis AI isn't configured correctly. Let an admin know." }
  }
  if (e instanceof Anthropic.BadRequestError) return { outcome: "bad_request", message: "Genesis AI couldn't process that. Start a new chat and try again." }
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) {
    return { outcome: "busy", message: "Genesis AI is busy right now. Try again in a minute." }
  }
  return { outcome: "error", message: "Something went wrong. Try again." }
}
