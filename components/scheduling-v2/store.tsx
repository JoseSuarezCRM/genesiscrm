"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { saveSchedulingState } from "@/app/actions/scheduling-state"
import { mergeSavedState, buildSavePayload } from "@/lib/scheduling/state"
import type { SchedulingData } from "@/lib/scheduling/types"

// View-scoped ephemera shared across sections (not persisted). Week-keyed volumes
// and assignments computed by the intern/XRT engines and shown in several places.
export interface Ephemeral {
  iaWeekStart: string | null
  iaVolumes: Record<string, number>
  iaAssignments: Record<string, string>
  iaManualOverrides: Record<string, string>
  xrtManualOverrides: Record<string, string>
  surgWeekStart: string | null
}

const emptyEphemeral: Ephemeral = {
  iaWeekStart: null,
  iaVolumes: {},
  iaAssignments: {},
  iaManualOverrides: {},
  xrtManualOverrides: {},
  surgWeekStart: null,
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
  const latest = useRef<SchedulingData>(data)
  const firstRun = useRef(true)
  latest.current = data

  const update = useCallback((mutator: (d: SchedulingData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev)
      mutator(next)
      return next
    })
  }, [])

  const setEphemeral = useCallback((mutator: (e: Ephemeral) => void) => {
    setEph((prev) => {
      const next = structuredClone(prev)
      mutator(next)
      return next
    })
  }, [])

  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    setStatus("saving")
    try {
      await saveSchedulingState(buildSavePayload(latest.current))
      setStatus("saved")
      setSavedAt(new Date())
    } catch {
      setStatus("dirty")
    }
  }, [])

  // Debounced autosave whenever the persisted data changes (skip the initial mount).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setStatus("dirty")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { flush() }, 1500)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [data, flush])

  // Best-effort save on tab hide / unload.
  useEffect(() => {
    const onHide = () => {
      if (status === "dirty") flush()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onHide)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onHide)
    }
  }, [status, flush])

  return (
    <SchedulingContext.Provider
      value={{ data, update, ephemeral, setEphemeral, status, savedAt, saveNow: flush }}
    >
      {children}
    </SchedulingContext.Provider>
  )
}
