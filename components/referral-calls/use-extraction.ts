"use client"

/**
 * When to ask the AI to read the call, and what to do with the answer.
 *
 * - A paste or a new screenshot reads at once; typing reads after 1.5 s idle.
 * - The same source is never read twice; one request at a time — a change
 *   made while one is in flight is read as soon as it returns.
 * - At most 12 automatic reads per call, so a long dictation can't run up a
 *   bill. After that the person can still tap "Read again".
 *
 * Answers are handed to `onReading` tagged with the source they were computed
 * from; the merge model decides what they may still fill (lib/referral-calls/merge.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { parseReferral } from "@/lib/referral-calls/parse"
import { sourceKey } from "@/lib/referral-calls/merge"
import type { ExtractResponse } from "@/lib/referral-calls/extract-types"
import type { PreparedImage } from "@/lib/referral-calls/image"
import type { ExtraValue } from "@/lib/referral-calls/snapshot"
import type { ReferralCallFields } from "@/lib/referral-calls/types"

const IDLE_MS = 1500
const MAX_AUTO_RUNS = 12
const MIN_TEXT = 12
const CLIENT_TIMEOUT_MS = 60_000

export interface Reading {
  key: string
  rulesAtRequest: ReferralCallFields
  fields: Partial<ReferralCallFields>
  extras: Record<string, ExtraValue>
}

export type ExtractionPhase = "idle" | "reading" | "done" | "error" | "paused" | "off"

export interface ExtractionStatus {
  phase: ExtractionPhase
  message: string | null
}

export function useExtraction({
  enabled, text, image, initialKey, onReading,
}: {
  enabled: boolean
  text: string
  image: PreparedImage | null
  /** The source already on screen when the page opened — not read again. */
  initialKey: string | null
  onReading: (r: Reading) => void
}) {
  const [status, setStatus] = useState<ExtractionStatus>(
    enabled ? { phase: "idle", message: null } : { phase: "off", message: null },
  )
  const latest = useRef({ text, image })
  latest.current = { text, image }
  const onReadingRef = useRef(onReading)
  onReadingRef.current = onReading

  const lastKey = useRef<string | null>(initialKey)
  const inFlight = useRef(false)
  const queued = useRef(false)
  const autoRuns = useRef(0)
  const immediate = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generation = useRef(0)

  const run = useCallback(async (auto: boolean) => {
    if (!enabled) return
    const { text: t, image: img } = latest.current
    const key = sourceKey(t, img?.key ?? null)
    if (!t.trim() && !img) return
    if (auto && key === lastKey.current) return
    if (auto && t.trim().length < MIN_TEXT && !img) return
    if (inFlight.current) { queued.current = true; return }
    if (auto && autoRuns.current >= MAX_AUTO_RUNS) {
      setStatus({ phase: "paused", message: "Automatic reading paused for this call. Tap Read again to read the latest." })
      return
    }

    inFlight.current = true
    lastKey.current = key
    if (auto) autoRuns.current++
    const gen = generation.current
    const rulesAtRequest = parseReferral(t)
    setStatus({ phase: "reading", message: null })

    const ctrl = new AbortController()
    const kill = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS)
    try {
      const res = await fetch("/api/referral-calls/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, image: img ? { mediaType: img.mediaType, data: img.data } : null }),
        signal: ctrl.signal,
        cache: "no-store",
      })
      const body = (await res.json().catch(() => null)) as ExtractResponse | null
      if (gen !== generation.current) return // the call was cleared meanwhile
      if (!body) {
        setStatus({ phase: "error", message: "The AI couldn't be reached. The fields show what the rules found." })
      } else if (!body.ok) {
        setStatus({ phase: "error", message: body.error })
      } else {
        onReadingRef.current({ key, rulesAtRequest, fields: body.fields, extras: body.extras })
        const n = Object.values(body.fields).filter((v) => (typeof v === "string" ? v.trim() !== "" : v === true)).length
          + Object.values(body.extras).filter((v) => v !== null && v !== "" && v !== false && !(Array.isArray(v) && !v.length)).length
        setStatus({ phase: "done", message: n ? `AI filled ${n} field${n === 1 ? "" : "s"} — check the ones marked AI.` : "The AI found nothing to add." })
      }
    } catch {
      if (gen !== generation.current) return
      setStatus({ phase: "error", message: "The AI took too long. The fields show what the rules found." })
    } finally {
      clearTimeout(kill)
      inFlight.current = false
      if (gen === generation.current && queued.current) {
        queued.current = false
        void run(true)
      }
    }
  }, [enabled])

  const key = sourceKey(text, image?.key ?? null)
  useEffect(() => {
    if (!enabled) return
    if (timer.current) clearTimeout(timer.current)
    const delay = immediate.current ? 0 : IDLE_MS
    immediate.current = false
    timer.current = setTimeout(() => void run(true), delay)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [key, enabled, run])

  return {
    status,
    /** Call before the state change a paste or screenshot causes: reads without the idle wait. */
    readSoon: () => { immediate.current = true },
    /** "Read again": reads now, whether or not the source changed. */
    readNow: () => void run(false),
    /** A new call: forget everything, and ignore answers still on their way. */
    reset: () => {
      generation.current++
      lastKey.current = null
      queued.current = false
      inFlight.current = false
      autoRuns.current = 0
      if (timer.current) clearTimeout(timer.current)
      setStatus(enabled ? { phase: "idle", message: null } : { phase: "off", message: null })
    },
  }
}
