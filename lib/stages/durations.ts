// Pure time-in-stage computation from a record's StageTransition history.
// Durations are in milliseconds; the reporting layer renders them via the
// "duration" value format. Time is measured up to `now` (or the closed time).
import type { Stage } from "./core"

export interface Transition {
  toStageId: string
  enteredAt: Date
}

export interface StageDurations {
  currentStageId: string | null
  timeInCurrentStage: number       // ms in the current stage (0 if none)
  timeToClose: number | null       // ms from first entry to entering a closed stage
  cumulative: Record<string, number> // stageId → total ms ever spent in that stage
  latest: Record<string, number>     // stageId → ms of the most recent visit
}

// transitions must be sorted ascending by enteredAt.
export function computeStageDurations(transitions: Transition[], stages: Stage[], now: Date = new Date()): StageDurations {
  const closedIds = new Set(stages.filter((s) => s.isClosed).map((s) => s.id))
  const cumulative: Record<string, number> = {}
  const latest: Record<string, number> = {}
  const nowMs = now.getTime()

  if (transitions.length === 0) {
    return { currentStageId: null, timeInCurrentStage: 0, timeToClose: null, cumulative, latest }
  }

  const sorted = [...transitions].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime())
  const firstMs = sorted[0].enteredAt.getTime()
  let timeToClose: number | null = null

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    const start = t.enteredAt.getTime()
    const end = i + 1 < sorted.length ? sorted[i + 1].enteredAt.getTime() : nowMs
    const dur = Math.max(0, end - start)
    cumulative[t.toStageId] = (cumulative[t.toStageId] ?? 0) + dur
    latest[t.toStageId] = dur // last write wins → the most recent visit's duration
    if (timeToClose == null && closedIds.has(t.toStageId)) timeToClose = Math.max(0, start - firstMs)
  }

  const last = sorted[sorted.length - 1]
  return {
    currentStageId: last.toStageId,
    timeInCurrentStage: Math.max(0, nowMs - last.enteredAt.getTime()),
    timeToClose,
    cumulative,
    latest,
  }
}
