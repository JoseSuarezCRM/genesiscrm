// The time-in-stage fields an object exposes, in one place.
//
// Both the report builder and a record's property catalog list these, so they share
// this definition — otherwise the same measure ends up with two names and a report
// column stops looking like the property it came from.
//
// Values are computed by computeStageDurations() (lib/stages/durations.ts) and
// rendered in DAYS, so every consumer divides the returned milliseconds by 864e5.

import { prisma } from "@/lib/prisma"

export type StageDurationKind = "current" | "toClose" | "cumulative" | "latest"

export interface StageDurationField {
  key: string
  label: string
  kind: StageDurationKind
  stageId?: string
}

/**
 * Duration fields for an object type ("REFERRAL" or "CO:<key>"), across ALL of its
 * pipelines — not just one record's — so a saved card or report column stays valid
 * for every record. Returns [] when the object has no stages at all.
 */
export async function stageDurationFieldsFor(objectType: string): Promise<StageDurationField[]> {
  const pipelines = await (prisma as any).pipeline.findMany({
    where: { objectType, isActive: true },
    select: { stages: { orderBy: { order: "asc" }, select: { id: true, name: true } } },
  }).catch(() => [])
  const stages = pipelines.flatMap((p: any) => p.stages as { id: string; name: string }[])
  if (stages.length === 0) return []

  const out: StageDurationField[] = [
    { key: "__stage.current", label: "Time in current stage", kind: "current" },
    { key: "__stage.toClose", label: "Time to close", kind: "toClose" },
  ]
  const seen = new Set<string>()
  for (const s of stages) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    out.push({ key: `__stage.cum.${s.id}`, label: `Cumulative time in "${s.name}"`, kind: "cumulative", stageId: s.id })
    out.push({ key: `__stage.latest.${s.id}`, label: `Latest time in "${s.name}"`, kind: "latest", stageId: s.id })
  }
  return out
}

/** Pull one duration field's value (in DAYS) out of a computed StageDurations bag. */
export function durationValue(
  sd: { timeInCurrentStage: number; timeToClose: number | null; cumulative: Record<string, number>; latest: Record<string, number> } | null | undefined,
  field: Pick<StageDurationField, "kind" | "stageId">,
): number | null {
  if (!sd) return null
  const ms = field.kind === "current" ? sd.timeInCurrentStage
    : field.kind === "toClose" ? sd.timeToClose
    : field.kind === "cumulative" ? (sd.cumulative[field.stageId!] ?? 0)
    : (sd.latest[field.stageId!] ?? 0)
  return ms == null ? null : ms / 864e5
}
