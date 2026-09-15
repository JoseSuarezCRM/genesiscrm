"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { saveSchedulingState } from "@/app/actions/scheduling-state"
import { mergeSavedState, buildSavePayload } from "@/lib/scheduling/state"
import type { SchedulingData } from "@/lib/scheduling/types"

/**
 * View-scoped state shared across sections but never persisted: the week the
 * Visit Count tab is showing, the volumes typed into it, and the assignments the
 * intern/XRT engines produced from them. They are ephemeral in the prototype too
 * — regenerating is cheap, and stale assignments on a stale week are worse than
 * none.
 */
export interface Ephemeral {
  iaWeekStart: string | null
  iaVolumes: Record<string, number>
  iaAssignments: Record<string, string>
  iaManualOverrides: Record<string, string>
  xrtManualOverrides: Record<string, string>
}

const emptyEphemeral: Ephemeral = {
  iaWeekStart: null,
  iaVolumes: {},
  iaAssignments: {},
  iaManualOverrides: {},
  xrtManualOverrides: {},
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved"

interface Ctx {
  data: SchedulingData
  update: (mutator: (d: SchedulingData) => void) => void
  ephemeral: Ephemeral
  setEphemeral: (mutator: (e: Ephemeral) => void) => void
  status: SaveStatus
  savedAt: Date | null
  saveNow: () => void
}

const SchedulingContext = createContext<Ctx | null>(null)

export function useScheduling(): Ctx {
  const ctx = useContext(SchedulingContext)
  if (!ctx) throw new Error("useScheduling must be used within SchedulingProvider")
  return ctx
}

const SAVE_DEBOUNCE_MS = 1200

export function SchedulingProvider({
  initialState,
  children,
}: {
  initialState: any
  children: React.ReactNode
}) {
  const [data, setData] = useState<SchedulingData>(() => mergeSavedState(initialState))
  const [ephemeral, setEph] = useState<Ephemeral>(emptyEphemeral)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(data)
  latest.current = data

  const flush = useCallback(async () => {
    setStatus("saving")
    try {
      await saveSchedulingState(buildSavePayload(latest.current))
      setSavedAt(new Date())
      setStatus("saved")
    } catch {
      // Keep the dirty flag so the next edit retries rather than losing the work.
      setStatus("dirty")
    }
  }, [])

  /**
   * Every mutation goes through here. The state is one deep object shared by every
   * section, so we clone before mutating — otherwise a nested array edit would not
   * change identity and React would skip the re-render.
   */
  const update = useCallback((mutator: (d: SchedulingData) => void) => {
    setData((prev) => {
      const next: SchedulingData = JSON.parse(JSON.stringify(prev))
      mutator(next)
      latest.current = next
      return next
    })
    setStatus("dirty")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void flush() }, SAVE_DEBOUNCE_MS)
  }, [flush])

  const setEphemeral = useCallback((mutator: (e: Ephemeral) => void) => {
    setEph((prev) => {
      const next: Ephemeral = JSON.parse(JSON.stringify(prev))
      mutator(next)
      return next
    })
  }, [])

  const saveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    void flush()
  }, [flush])

  // Don't lose a pending debounce when someone closes the tab mid-edit.
  useEffect(() => {
    const onLeave = () => { if (saveTimer.current) { clearTimeout(saveTimer.current); void flush() } }
    window.addEventListener("beforeunload", onLeave)
    return () => {
      window.removeEventListener("beforeunload", onLeave)
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [flush])

  return (
    <SchedulingContext.Provider
      value={{ data, update, ephemeral, setEphemeral, status, savedAt, saveNow }}
    >
      {children}
    </SchedulingContext.Provider>
  )
}
