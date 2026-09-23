"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Users2, Loader2, Plus, Check } from "lucide-react"
import { listStaticSegmentsFor, addToSegment, createStaticSegmentFromRecords } from "@/app/actions/segments"
import { bulkBtn } from "@/components/ui/bulk-action-bar"
import { cn } from "@/lib/utils"

/**
 * "Add to segment" for any list's bulk bar.
 *
 * Only STATIC segments are offered. An ACTIVE segment's members come from its
 * filter, so a record added by hand would simply be gone on the next read —
 * `addToSegment` rejects that too, this just keeps it out of the menu.
 */
export default function AddToSegmentButton({
  objectType,
  recordIds,
  onDone,
}: {
  objectType: string
  recordIds: string[]
  /** Called after a successful add, so the list can clear its selection. */
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [segments, setSegments] = useState<{ id: string; name: string; size: number | null }[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  // Loaded when the menu opens rather than on mount — this button sits in every
  // list's bulk bar, and most selections never reach for it.
  useEffect(() => {
    if (!open || segments !== null) return
    listStaticSegmentsFor(objectType).then((r) => setSegments(r as any)).catch(() => setSegments([]))
  }, [open, objectType, segments])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  function add(segmentId: string, _name: string) {
    setError(null)
    startTransition(async () => {
      const r = await addToSegment(segmentId, recordIds)
      if ("error" in r && r.error) { setError(r.error); return }
      setOpen(false)
      setSegments(null) // sizes changed
      onDone?.()
      router.refresh()
    })
  }

  function createAndAdd() {
    const name = newName.trim()
    if (!name) return
    setError(null)
    startTransition(async () => {
      const r = await createStaticSegmentFromRecords(objectType, name, recordIds)
      if ("error" in r && r.error) { setError(r.error); return }
      setOpen(false)
      setCreating(false)
      setNewName("")
      setSegments(null)
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} disabled={isPending} className={bulkBtn}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users2 className="h-3.5 w-3.5" />}
        Add to segment
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {creating ? (
            <div className="p-3 space-y-2">
              <label className="block text-xs font-medium text-zinc-700">New static segment</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); if (e.key === "Escape") setCreating(false) }}
                placeholder="Segment name"
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <p className="text-xs text-zinc-500">
                Holds the {recordIds.length} selected record{recordIds.length !== 1 ? "s" : ""} and doesn&apos;t change on its own.
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={createAndAdd}
                  disabled={!newName.trim() || isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />} Create
                </button>
                <button onClick={() => setCreating(false)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-64 overflow-auto py-1">
                {segments === null ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : segments.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-500">
                    No static segments for this object yet.
                  </p>
                ) : (
                  segments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => add(s.id, s.name)}
                      disabled={isPending}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 disabled:opacity-50",
                      )}
                    >
                      <span className="truncate text-zinc-900">{s.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400">{s.size ?? 0}</span>
                    </button>
                  ))
                )}
              </div>
              {error && <p className="border-t border-zinc-100 px-3 py-2 text-xs text-red-600">{error}</p>}
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 border-t border-zinc-100 px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                <Plus className="h-3.5 w-3.5" /> New static segment…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
