"use client"

import { useState } from "react"
import Link from "next/link"
import { moveRecordStage, type BoardCard } from "@/app/actions/stages"

interface Stage { id: string; name: string; color: string | null }

function timeInStage(enteredAt: string | null): string {
  if (!enteredAt) return ""
  const ms = Date.now() - new Date(enteredAt).getTime()
  const days = Math.floor(ms / 864e5)
  if (days >= 1) return `${days}d in stage`
  const hrs = Math.floor(ms / 36e5)
  if (hrs >= 1) return `${hrs}h in stage`
  return `${Math.max(1, Math.floor(ms / 6e4))}m in stage`
}

const UNASSIGNED = "__unassigned"

// Drag-and-drop stage board for a custom object. Dropping a card into a column
// logs a stage transition (which the durations engine reads).
export default function KanbanBoard({ objectKey, pipelineId, stages, cards: initial }: {
  objectKey: string; pipelineId: string; stages: Stage[]; cards: BoardCard[]
}) {
  const [cards, setCards] = useState(initial)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const recordType = `CO:${objectKey}`

  function onDrop(stageId: string) {
    setOver(null)
    const id = dragId; setDragId(null)
    if (!id || stageId === UNASSIGNED) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.stageId === stageId) return
    setCards((cs) => cs.map((c) => c.id === id ? { ...c, stageId, enteredAt: new Date().toISOString() } : c))
    moveRecordStage(recordType, id, pipelineId, stageId).catch(() => {})
  }

  const columns: { id: string; name: string; color: string | null }[] = [
    ...(cards.some((c) => c.stageId == null) ? [{ id: UNASSIGNED, name: "Unassigned", color: "#94a3b8" }] : []),
    ...stages,
  ]

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => {
        const colCards = cards.filter((c) => (c.stageId ?? UNASSIGNED) === col.id)
        return (
          <div key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id) }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={() => onDrop(col.id)}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-zinc-50 ${over === col.id ? "border-blue-400 ring-2 ring-blue-200" : "border-zinc-200"}`}>
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color ?? "#94a3b8" }} />{col.name}
              </span>
              <span className="text-xs text-zinc-400">{colCards.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ minHeight: 120 }}>
              {colCards.map((c) => (
                <Link key={c.id} href={`/objects/${objectKey}/${c.id}`}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`block cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm hover:border-zinc-300 active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}>
                  <p className="truncate text-sm font-medium text-zinc-900">{c.title}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
                    <span className="truncate">{c.ownerName ?? ""}</span>
                    {c.stageId && <span className="shrink-0">{timeInStage(c.enteredAt)}</span>}
                  </div>
                </Link>
              ))}
              {colCards.length === 0 && <p className="px-1 py-6 text-center text-xs text-zinc-300">Drop here</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
