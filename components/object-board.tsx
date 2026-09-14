"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Clock, StickyNote, Mail, CheckSquare, X, Info, Link2 } from "lucide-react"
import { moveRecordStage } from "@/app/actions/stages"
import type { ObjectBoardCard, ObjectBoardStage } from "@/app/actions/object-board"
import { PipelineChip } from "@/components/pipeline-chip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import RecordEngagementBar from "@/components/record-engagement-bar"
import { displayCell, relativeDay, relativeAgo, timeInStage } from "@/components/object-display"
import { formatNumber } from "@/lib/number-format"
import { BOARD_AGGS, type BoardConfig, type BoardMetric } from "@/lib/object-views"
import type { ObjectProperty } from "@/lib/object-columns"
import { cn } from "@/lib/utils"

const UNASSIGNED = "__unassigned"

interface Props {
  objectType: string          // "CO:<key>"
  hrefBase: string            // "/objects/<key>"
  pipelineId: string
  stages: ObjectBoardStage[]
  cards: ObjectBoardCard[]
  properties: ObjectProperty[]
  userMap: Record<string, string>
  users: { id: string; label: string }[]
  config: BoardConfig
  colorStyle?: string
  canEdit: boolean
  truncated?: boolean
  onConfigChange: (next: BoardConfig) => void
  /** Fired after a stage move sticks, so the shell can reload the board's own data. */
  onMoved?: () => void
}

// ── Metrics ──────────────────────────────────────────────────────────────────

function numbersIn(cards: ObjectBoardCard[], propertyId: string | null): number[] {
  if (!propertyId) return []
  const out: number[] = []
  for (const c of cards) {
    const raw = c.values?.[propertyId]
    if (raw === null || raw === undefined || raw === "") continue
    // Custom-object values are a schemaless bag, so a NUMBER property can hold
    // either 8504 or "8504" — coerce rather than trusting the stored type.
    const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.-]/g, ""))
    if (!isNaN(n)) out.push(n)
  }
  return out
}

/** One footer line for one column. Returns null when the metric can't be shown. */
function metricLine(
  metric: BoardMetric,
  cards: ObjectBoardCard[],
  stage: ObjectBoardStage | null,
  properties: ObjectProperty[],
): { value: string; label: string } | null {
  const agg = BOARD_AGGS.find((a) => a.value === metric.agg)
  if (!agg) return null
  if (agg.value === "count") return { value: String(cards.length), label: "Record count" }

  const prop = properties.find((p) => p.id === metric.propertyId)
  if (!prop) return null
  const nums = numbersIn(cards, metric.propertyId)
  const fmt = (n: number) => formatNumber(n, (prop as any).numberFormat)
  const sum = nums.reduce((a, b) => a + b, 0)

  switch (agg.value) {
    case "sum":
      return { value: fmt(sum), label: `Total ${prop.name.toLowerCase()}` }
    case "avg":
      // Divide by the cards that actually carry a value — a blank isn't a zero.
      return { value: nums.length ? fmt(sum / nums.length) : fmt(0), label: `Average ${prop.name.toLowerCase()}` }
    case "weighted": {
      const pct = stage?.probability ?? 0
      return { value: `${fmt((sum * pct) / 100)} (${pct}%)`, label: `Weighted ${prop.name.toLowerCase()}` }
    }
    case "min":
      return { value: nums.length ? fmt(Math.min(...nums)) : "—", label: `Lowest ${prop.name.toLowerCase()}` }
    case "max":
      return { value: nums.length ? fmt(Math.max(...nums)) : "—", label: `Highest ${prop.name.toLowerCase()}` }
    default:
      return null
  }
}

// ── Card ─────────────────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?"
}

function BoardCard({ card, stage, properties, userMap, config, hrefBase, onDragStart, onDragEnd, dragging, onQuickAction }: {
  card: ObjectBoardCard
  stage: ObjectBoardStage | null
  properties: ObjectProperty[]
  userMap: Record<string, string>
  config: BoardConfig
  hrefBase: string
  onDragStart: () => void
  onDragEnd: () => void
  dragging: boolean
  onQuickAction: (composer: "NOTE" | "EMAIL" | "TASK") => void
}) {
  const lines = config.cardProperties
    .map((id) => properties.find((p) => p.id === id))
    .filter((p): p is ObjectProperty => !!p)

  const showFooter = config.showLastActivity || config.showActions

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-lg border bg-white transition-all cursor-grab active:cursor-grabbing",
        dragging
          ? "border-zinc-300 opacity-40 shadow-lg"
          : "border-zinc-200 shadow-[0_1px_2px_rgba(16,24,40,0.06)] hover:border-zinc-300 hover:shadow-md",
      )}
    >
      <div className="p-3">
        <div className="flex items-start gap-1.5">
          <Link href={`${hrefBase}/${card.id}`} onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-teal-700 hover:text-teal-900 hover:underline">
            {card.title}
          </Link>
          {config.showTimeInStage && card.enteredAt && (
            <span title={timeInStage(card.enteredAt)} className="mt-0.5 shrink-0 text-zinc-400">
              <Clock className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        {lines.length > 0 && (
          <div className="mt-2 space-y-1">
            {lines.map((p) => {
              const v = card.values?.[p.id]
              const empty = v === null || v === undefined || v === ""
              const rel = !empty && (p.type === "DATE" || p.type === "DATE_TIME") ? relativeDay(v) : ""
              return (
                <div key={p.id} className="flex gap-1 text-xs leading-4">
                  <span className="shrink-0 text-zinc-500">{p.name}:</span>
                  <span className="min-w-0 text-zinc-800">
                    {empty ? <span className="text-zinc-300">—</span> : displayCell(p, v, userMap)}
                    {rel && <span className="text-zinc-400"> ({rel})</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {config.showChips && card.chips.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 px-3 py-2">
            {card.chips.slice(0, 3).map((c) => (
              <span key={`${c.type}:${c.name}`} title={c.typeLabel}
                className="inline-flex max-w-full items-center rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                <span className="truncate">{c.name}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 border-t border-zinc-100 px-3 py-2">
            <Link2 className="h-3 w-3 shrink-0 text-zinc-300" />
            {card.chips.slice(0, 4).map((c) => (
              <span key={`av-${c.type}:${c.name}`} title={`${c.typeLabel}: ${c.name}`}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-semibold text-zinc-500 ring-1 ring-white">
                {initialsOf(c.name)}
              </span>
            ))}
          </div>
        </>
      )}

      {showFooter && (
        <div className="flex min-h-[2rem] items-center justify-between gap-2 border-t border-zinc-100 px-3 py-1.5">
          {config.showLastActivity && card.lastActivity ? (
            <p className="min-w-0 truncate text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-700">{card.lastActivity.kind}</span> {relativeAgo(card.lastActivity.at)}
            </p>
          ) : <span />}
          {config.showActions && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button title="Add a note" onClick={() => onQuickAction("NOTE")} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><StickyNote className="h-3.5 w-3.5" /></button>
              <button title="Send an email" onClick={() => onQuickAction("EMAIL")} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><Mail className="h-3.5 w-3.5" /></button>
              <button title="Create a task" onClick={() => onQuickAction("TASK")} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><CheckSquare className="h-3.5 w-3.5" /></button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Board ────────────────────────────────────────────────────────────────────

export default function ObjectBoard({
  objectType, hrefBase, pipelineId, stages, cards: initial, properties, userMap, users,
  config, colorStyle = "dot", canEdit, truncated = false, onConfigChange, onMoved,
}: Props) {
  const [cards, setCards] = useState(initial)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quick, setQuick] = useState<{ card: ObjectBoardCard; composer: "NOTE" | "EMAIL" | "TASK" } | null>(null)

  // Adopt a fresh server page (pipeline switch, refresh) without losing the optimistic
  // move that's already on screen. Compare the CONTENT, not the array identity: a
  // re-render carrying the same cards must be a no-op, or a successful drop — which
  // revalidates the page — would snap the card back to the stage it came from.
  const signature = initial.map((c) => `${c.id}:${c.stageId ?? ""}`).join("|")
  const [seenSig, setSeenSig] = useState(signature)
  if (signature !== seenSig) { setSeenSig(signature); setCards(initial) }

  function onDrop(stageId: string) {
    setOver(null)
    const id = dragId; setDragId(null)
    if (!id || !canEdit || stageId === UNASSIGNED) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.stageId === stageId) return
    const prevStage = card.stageId, prevEntered = card.enteredAt
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stageId, enteredAt: new Date().toISOString() } : c)))
    setError(null)
    moveRecordStage(objectType, id, pipelineId, stageId)
      .then((res) => {
        if ((res as any)?.error) {
          // Pipeline rules and required-to-enter fields are enforced server-side —
          // only a real rejection puts the card back.
          setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stageId: prevStage, enteredAt: prevEntered } : c)))
          setError((res as any).error)
          return
        }
        onMoved?.()
      })
      .catch(() => {
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stageId: prevStage, enteredAt: prevEntered } : c)))
        setError("Couldn't save that move — check your connection and try again.")
      })
  }

  const collapsed = new Set(config.collapsedStageIds)
  function toggleCollapsed(id: string) {
    const next = new Set(collapsed)
    next.has(id) ? next.delete(id) : next.add(id)
    onConfigChange({ ...config, collapsedStageIds: Array.from(next) })
  }

  const columns: { id: string; name: string; color: string | null; stage: ObjectBoardStage | null }[] = [
    ...(cards.some((c) => c.stageId == null) ? [{ id: UNASSIGNED, name: "Unassigned", color: "#94a3b8", stage: null }] : []),
    ...stages.map((s) => ({ id: s.id, name: s.name, color: s.color, stage: s })),
  ]

  const metrics = config.showMetrics ? config.metrics.slice(0, 2) : []

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700"><X className="h-4 w-4" /></button>
        </div>
      )}
      {truncated && (
        <p className="text-xs text-amber-600">
          Showing the most recent 2,000 records on this board — narrow the view with a filter to see the rest.
        </p>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colCards = cards.filter((c) => (c.stageId ?? UNASSIGNED) === col.id)
          const isCollapsed = collapsed.has(col.id)

          if (isCollapsed) {
            return (
              <button key={col.id} onClick={() => toggleCollapsed(col.id)}
                title={`Expand ${col.name}`}
                className="flex w-12 shrink-0 flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 py-3 hover:border-zinc-400">
                <ChevronRight className="h-4 w-4 text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-500">{colCards.length}</span>
                <span className="whitespace-nowrap text-xs font-medium text-zinc-600" style={{ writingMode: "vertical-rl" }}>{col.name}</span>
              </button>
            )
          }

          return (
            <div key={col.id}
              onDragOver={(e) => { e.preventDefault(); setOver(col.id) }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={() => onDrop(col.id)}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/70">
              <div className="group/col flex items-center gap-1.5 border-b border-zinc-200 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">
                  <PipelineChip name={col.name} color={col.color ?? "#94a3b8"} style={col.id === UNASSIGNED ? "dot" : colorStyle} />
                </span>
                <span className="shrink-0 rounded-full bg-zinc-200/70 px-1.5 text-xs font-medium tabular-nums text-zinc-600">{colCards.length}</span>
                <button title="Collapse column" onClick={() => toggleCollapsed(col.id)}
                  className="shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-200 hover:text-zinc-700 group-hover/col:opacity-100">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Dashed outline marks the drop area while a card is over the column. */}
              <div className={cn(
                "m-2 flex-1 space-y-2 overflow-y-auto rounded-lg border-2 border-dashed p-1 transition-colors",
                over === col.id && dragId ? "border-zinc-400 bg-white/60" : "border-transparent",
              )} style={{ minHeight: 140, maxHeight: "calc(100vh - 24rem)" }}>
                {colCards.map((c) => (
                  <BoardCard key={c.id} card={c} stage={col.stage} properties={properties} userMap={userMap}
                    config={config} hrefBase={hrefBase}
                    dragging={dragId === c.id}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    onQuickAction={(composer) => setQuick({ card: c, composer })} />
                ))}
                {colCards.length === 0 && (
                  <p className="px-1 py-8 text-center text-xs text-zinc-400">
                    {dragId && canEdit ? "Drop here" : "No records"}
                  </p>
                )}
              </div>

              {metrics.length > 0 && (
                <div className="space-y-1 border-t border-zinc-200 px-3 py-2">
                  {metrics.map((m, i) => {
                    const line = metricLine(m, colCards, col.stage, properties)
                    if (!line) return null
                    return (
                      <p key={i} className="flex items-baseline gap-1.5 text-xs">
                        <span className="font-semibold tabular-nums text-zinc-900">{line.value}</span>
                        <span className="text-zinc-300">|</span>
                        <span className="truncate text-zinc-500">{line.label}</span>
                      </p>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {quick && (
        <Dialog open onOpenChange={(o) => !o && setQuick(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle className="text-base">{quick.card.title}</DialogTitle></DialogHeader>
            <RecordEngagementBar recordType={objectType} recordId={quick.card.id} users={users}
              canEdit={canEdit} compact initialComposer={quick.composer}
              onLogged={() => setQuick(null)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
