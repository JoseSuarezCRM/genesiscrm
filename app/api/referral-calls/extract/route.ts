/**
 * POST /api/referral-calls/extract — read pasted call notes and/or a screenshot
 * into the on-call intake's fields.
 *
 * One structured-output call to the Messages API. The answer is only ever a
 * suggestion: the intake shows it under the fields' own values and never
 * overwrites one the person has touched.
 *
 * PHI handling, all deliberate:
 * - Nothing from the request or the answer is logged; see lib/referral-calls/safe-log.ts.
 * - The screenshot is never stored — not in Blob, not in the database.
 * - First-party Messages API only, image inline (no Files API), no beta features.
 * - The JSON schema carries no admin text and no PHI; see lib/referral-calls/ai-prompt.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { checkRateLimit } from "@/lib/rate-limit"
import { createAuditLog } from "@/lib/audit"
import { getAnthropicClient } from "@/lib/anthropic"
import { RC_EXTRACT_MODEL, RC_PERM_KEY } from "@/lib/referral-calls/constants"
import { getReferralCallDef } from "@/lib/referral-calls/provision"
import { getExtractionProfile } from "@/lib/referral-calls/profile"
import { buildExtractionPlan } from "@/lib/referral-calls/ai-prompt"
import { normalizeAnswer } from "@/lib/referral-calls/ai-normalize"
import { rcSafeLog, type ExtractOutcome } from "@/lib/referral-calls/safe-log"
import { RC_FIELD_MAX } from "@/lib/referral-calls/snapshot"
import type { ExtractResponse } from "@/lib/referral-calls/extract-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 90

/** Vercel rejects bodies over 4.5 MB before they reach us; stay under it. */
const MAX_BODY = 4 * 1024 * 1024
/** Decoded image bytes. The client downsizes to ≤ 2048 px JPEG, well under this. */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
/** Extractions per person per 15 minutes. A call takes a few; this stops a runaway loop. */
const RATE_LIMIT = 60

const Body = z
  .object({
    text: z.string().max(RC_FIELD_MAX).default(""),
    image: z
      .object({
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        data: z.string().max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+=*$/),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict()

const json = (body: ExtractResponse, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

const fail = (code: ExtractOutcome, error: string, status: number) => json({ ok: false, code, error }, status)

/** The bytes must be what the declared type says — a renamed file is refused. */
function magicMatches(mediaType: string, bytes: Buffer): boolean {
  if (mediaType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mediaType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mediaType === "image/webp") return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP"
  return false
}

export async function POST(req: NextRequest) {
  const started = Date.now()

  const session = await auth()
  const user = session?.user as { id?: string } | undefined
  if (!user?.id) return fail("bad_request", "Your session has ended. Sign in again.", 401)
  if (!userCanLevel(session!.user as any, RC_PERM_KEY, "EDIT")) {
    return fail("bad_request", "You don't have permission to log calls.", 403)
  }

  // JSON only: a form post from another site can't reach this with a JSON body.
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return fail("bad_request", "Unsupported request.", 415)
  }
  const declared = Number(req.headers.get("content-length") ?? "0")
  if (declared > MAX_BODY) return fail("bad_image", "That image is too large. Try a smaller screenshot.", 413)

  const rl = checkRateLimit(`rc-extract:${user.id}`, RATE_LIMIT)
  if (!rl.allowed) return fail("busy", "Too many AI reads in a short time. Wait a few minutes — the fields still fill from the rules.", 429)

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return fail("bad_request", "The request couldn't be read.", 400)
  }
  if (raw.length > MAX_BODY) return fail("bad_image", "That image is too large. Try a smaller screenshot.", 413)

  let body: z.infer<typeof Body>
  try {
    const parsed = Body.safeParse(JSON.parse(raw))
    // Never return or log the issues: they carry the received values.
    if (!parsed.success) return fail("bad_request", "The request couldn't be read.", 400)
    body = parsed.data
  } catch {
    return fail("bad_request", "The request couldn't be read.", 400)
  }

  const text = body.text.trim()
  const image = body.image ?? null
  if (!text && !image) return fail("bad_request", "Paste the call notes or a screenshot first.", 400)

  let imageBytes = 0
  if (image) {
    const buf = Buffer.from(image.data, "base64")
    imageBytes = buf.length
    if (buf.length > MAX_IMAGE_BYTES) return fail("bad_image", "That image is too large. Try a smaller screenshot.", 413)
    if (!magicMatches(image.mediaType, buf)) return fail("bad_image", "That file isn't a readable image.", 400)
  }
  const kind = text && image ? "both" : image ? "image" : "text"

  const def = await getReferralCallDef()
  if (!def) return fail("unavailable", "On-call isn't set up yet. Ask an admin to open the On-call page once.", 409)
  if (!process.env.ANTHROPIC_API_KEY) return fail("unavailable", "AI reading isn't configured. The fields still fill from the rules.", 503)

  const profile = await getExtractionProfile()
  const plan = buildExtractionPlan(def.properties, profile)

  let outcome: ExtractOutcome = "error"
  let stop: string | undefined
  let requestId: string | undefined
  let usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null } | undefined
  let status = 500

  try {
    const content: Anthropic.ContentBlockParam[] = []
    if (image) {
      content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } })
    }
    content.push({
      type: "text",
      text: text
        ? `<call_notes>\n${text}\n</call_notes>${image ? "\n\nThe screenshot above shows the same call." : ""}`
        : "The screenshot above is the call. Extract the fields from it.",
    })

    const msg = await getAnthropicClient().messages.create(
      {
        model: RC_EXTRACT_MODEL,
        max_tokens: 16000,
        system: [{ type: "text", text: plan.system, cache_control: { type: "ephemeral" } }],
        output_config: { effort: "low", format: { type: "json_schema", schema: plan.schema } },
        messages: [{ role: "user", content }],
      },
      { timeout: 40_000, maxRetries: 1 },
    )

    requestId = (msg as unknown as { _request_id?: string | null })._request_id ?? undefined
    stop = msg.stop_reason ?? undefined
    usage = msg.usage

    if (msg.stop_reason === "refusal") {
      outcome = "refusal"
      status = 200
      return fail("refusal", "The AI couldn't read this one. The fields show what the rules found.", 200)
    }
    if (msg.stop_reason === "max_tokens") {
      outcome = "truncated"
      status = 200
      return fail("truncated", "The AI's answer was cut off. The fields show what the rules found.", 200)
    }

    // A thinking block may come first; the answer is the text block.
    const block = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")
    let answer: unknown = null
    try {
      answer = block ? JSON.parse(block.text) : null
    } catch {
      answer = null
    }
    const normalized = answer === null ? null : normalizeAnswer(plan, answer)
    if (!normalized) {
      outcome = "invalid_output"
      status = 200
      return fail("invalid_output", "The AI's answer couldn't be read. The fields show what the rules found.", 200)
    }

    outcome = "ok"
    status = 200
    return json({ ok: true, fields: normalized.fields, extras: normalized.extras })
  } catch (e) {
    const mapped = mapError(e)
    outcome = mapped.outcome
    status = mapped.status
    if (e instanceof Anthropic.APIError && e.requestID) requestId = e.requestID
    return fail(mapped.outcome, mapped.message, mapped.status)
  } finally {
    const ms = Date.now() - started
    rcSafeLog("extract", {
      outcome, kind, ms, status, stop, requestId,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      cacheReadTokens: usage?.cache_read_input_tokens ?? undefined,
      fields: plan.builtins.length,
      extraFields: plan.extras.length,
    })
    await createAuditLog({
      userId: user.id,
      action: "AI_EXTRACTION",
      resourceType: RC_PERM_KEY,
      // Metadata only. Never the notes, the image or the answer.
      metadata: {
        model: RC_EXTRACT_MODEL, kind, outcome, stop: stop ?? null, requestId: requestId ?? null, ms,
        textChars: text.length, imageBytes,
        inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null,
      },
    })
  }
}

function mapError(e: unknown): { outcome: ExtractOutcome; status: number; message: string } {
  const rules = "The fields show what the rules found."
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return { outcome: "timeout", status: 504, message: `The AI took too long. ${rules}` }
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return { outcome: "unavailable", status: 502, message: `The AI couldn't be reached. ${rules}` }
  }
  if (e instanceof Anthropic.RateLimitError) {
    return { outcome: "busy", status: 503, message: `The AI is busy right now. Try again in a minute. ${rules}` }
  }
  if (e instanceof Anthropic.BadRequestError) {
    const m = String(e.message ?? "")
    if (/too complex/i.test(m)) {
      return { outcome: "schema_too_complex", status: 422, message: "The AI rules have too many added fields to read at once. An admin can turn some off in Settings → On-call AI." }
    }
    if (/image/i.test(m)) return { outcome: "bad_image", status: 400, message: `That image couldn't be read. ${rules}` }
    return { outcome: "bad_request", status: 502, message: `The AI couldn't read this one. ${rules}` }
  }
  if (e instanceof Anthropic.APIError && typeof e.status === "number" && e.status >= 500) {
    return { outcome: "busy", status: 503, message: `The AI is busy right now. Try again in a minute. ${rules}` }
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return { outcome: "unavailable", status: 503, message: `AI reading isn't configured correctly. ${rules}` }
  }
  return { outcome: "error", status: 500, message: `Something went wrong reading this. ${rules}` }
}
