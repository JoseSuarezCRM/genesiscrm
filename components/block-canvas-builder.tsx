"use client"

import React, { useState } from "react"
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Copy, Trash2 } from "lucide-react"
import { proxyImageSrc } from "@/lib/blob-display"
import { cn } from "@/lib/utils"

// Generic HubSpot-style visual builder: a left module palette, a center WYSIWYG
// canvas rendering each block's real output, and a right settings panel for the
// selected block. Blocks reorder by drag; modules add by click or drag; you can
// drag modules INTO a Columns block's cells to place blocks side by side.

export interface CanvasRegion { key: string; label: string; hint?: string }
export interface PaletteItem { type: string; label: string; icon: any }

interface Props<B extends { id: string; type: string; region?: string }> {
  blocks: B[]
  onChange: (next: B[]) => void
  palette: PaletteItem[]
  makeBlock: (type: string, region?: string) => B
  preview: (b: B) => string          // HTML string rendered on the canvas
  renderSettings: (b: B, patch: (p: Partial<B>) => void) => React.ReactNode
  regions?: CanvasRegion[]
  pageWidth?: number
  pageStyle?: React.CSSProperties
}

const SINGLE: CanvasRegion[] = [{ key: "body", label: "" }]

export default function BlockCanvasBuilder<B extends { id: string; type: string; region?: string }>({
  blocks, onChange, palette, makeBlock, preview, renderSettings, regions, pageWidth = 640, pageStyle,
}: Props<B>) {
  const regioned = !!regions && regions.length > 0
  const regionList = regioned ? regions! : SINGLE
  const regionOf = (b: B) => (regioned ? (b.region ?? regionList[0].key) : "body")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [active, setActive] = useState<{ type: string } | null>(null)

  const childrenOf = (b: B): B[][] | null => (b.type === "columns" && Array.isArray((b as any).columns) ? (b as any).columns as B[][] : null)

  // ── nested-aware find/patch/remove/duplicate (a block may live in a cell) ──
  function findBlock(id: string): B | null {
    for (const b of blocks) {
      if (b.id === id) return b
      const cols = childrenOf(b)
      if (cols) for (const col of cols) for (const c of col) if (c.id === id) return c
    }
    return null
  }
  const mapDeep = (bs: B[], fn: (b: B) => B): B[] => bs.map((b) => {
    const cols = childrenOf(b)
    if (cols) return fn({ ...b, columns: cols.map((col) => col.map(fn)) } as any)
    return fn(b)
  })
  const patch = (id: string, p: Partial<B>) => onChange(mapDeep(blocks, (b) => (b.id === id ? { ...b, ...p } : b)))
  const remove = (id: string) => {
    const strip = (bs: B[]): B[] => bs.filter((b) => b.id !== id).map((b) => { const cols = childrenOf(b); return cols ? ({ ...b, columns: cols.map(strip) } as any) : b })
    onChange(strip(blocks)); if (selectedId === id) setSelectedId(null)
  }
  const duplicate = (id: string) => {
    const b = blocks.find((x) => x.id === id); if (!b) return
    const copy = { ...b, id: `${b.id}_c${Math.random().toString(36).slice(2, 6)}` } as B
    const i = blocks.indexOf(b); onChange([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)])
  }

  const add = (type: string, region: string) => { const nb = makeBlock(type, region); onChange([...blocks, nb]); setSelectedId(nb.id) }
  const defaultRegion = () => { const s = selectedId ? blocks.find((b) => b.id === selectedId) : null; return s ? regionOf(s) : (regionList.find((r) => r.key === "body")?.key ?? regionList[0].key) }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor))
  const idsIn = (regionKey: string): string[] => blocks.filter((b) => regionOf(b) === regionKey).map((b) => b.id)

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    setActive({ type: id.startsWith("new:") ? id.slice(4) : (findBlock(id)?.type ?? "block") })
  }

  function addToCell(colBlockId: string, ci: number, block: B) {
    onChange(blocks.map((b) => {
      if (b.id !== colBlockId) return b
      const cols = childrenOf(b); if (!cols) return b
      return { ...b, columns: cols.map((col, i) => (i === ci ? [...col, block] : col)) } as any
    }))
    setSelectedId(block.id)
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null)
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId) return

    // Drop into a column cell → place side by side (leaf blocks only).
    if (overId.startsWith("cell:")) {
      const [, colBlockId, ciStr] = overId.split(":"); const ci = Number(ciStr)
      if (activeId.startsWith("new:")) {
        const type = activeId.slice(4); const nb = makeBlock(type)
        if (childrenOf(nb)) return // don't nest columns in a cell
        addToCell(colBlockId, ci, nb); return
      }
      const moving = findBlock(activeId); if (!moving || childrenOf(moving)) return
      // Strip the block from wherever it is (top level or another cell), then add it to this cell.
      const strip = (bs: B[]): B[] => bs.filter((b) => b.id !== activeId).map((b) => { const c = childrenOf(b); return c ? ({ ...b, columns: c.map(strip) } as any) : b })
      const stripped = strip(blocks)
      onChange(stripped.map((b) => { if (b.id !== colBlockId) return b; const cols = childrenOf(b); return cols ? ({ ...b, columns: cols.map((col, i) => (i === ci ? [...col, moving] : col)) } as any) : b }))
      setSelectedId(activeId); return
    }

    const overRegion = overId.startsWith("region:") ? overId.slice(7) : (blocks.find((b) => b.id === overId) ? regionOf(blocks.find((b) => b.id === overId)!) : null)
    if (!overRegion) return
    const overIds = idsIn(overRegion)
    const overIndex = overId.startsWith("region:") ? overIds.length : overIds.indexOf(overId)

    if (activeId.startsWith("new:")) {
      const nb = makeBlock(activeId.slice(4), overRegion)
      const flatIndex = overId.startsWith("region:")
        ? (overIds.length ? blocks.indexOf(blocks.find((b) => b.id === overIds[overIds.length - 1])!) + 1 : blocks.length)
        : blocks.indexOf(blocks.find((b) => b.id === overId)!)
      const next = [...blocks]; next.splice(Math.max(0, flatIndex), 0, nb)
      onChange(next); setSelectedId(nb.id); return
    }

    if (activeId === overId) return
    const moving = blocks.find((b) => b.id === activeId); if (!moving) return // only top-level reorder here
    const fromRegion = regionOf(moving)
    const map = new Map(blocks.map((b) => [b.id, b]))
    if (fromRegion === overRegion) {
      const next = arrayMove(overIds, overIds.indexOf(activeId), overIndex < 0 ? overIds.length - 1 : overIndex)
      onChange(regionList.flatMap((r) => (r.key === overRegion ? next.map((id) => map.get(id)!) : blocks.filter((b) => regionOf(b) === r.key))))
    } else {
      const moved = { ...moving, region: overRegion } as B
      const rest = blocks.filter((b) => b.id !== activeId)
      const targetIds = rest.filter((b) => regionOf(b) === overRegion).map((b) => b.id)
      const insertAt = overId.startsWith("region:") ? targetIds.length : Math.max(0, targetIds.indexOf(overId))
      targetIds.splice(insertAt, 0, moved.id)
      const m2 = new Map([...rest, moved].map((b) => [b.id, b]))
      onChange(regionList.flatMap((r) => (r.key === overRegion ? targetIds.map((id) => m2.get(id)!) : rest.filter((b) => regionOf(b) === r.key))))
    }
  }

  const selected = selectedId ? findBlock(selectedId) : null

  const renderBody = (b: B): React.ReactNode => {
    const cols = childrenOf(b)
    if (!cols) return <div className="p-1" dangerouslySetInnerHTML={{ __html: proxyImageSrc(preview(b)) }} />
    return (
      <div className="flex gap-2 p-1">
        {cols.map((col, ci) => (
          <Cell key={ci} id={`cell:${b.id}:${ci}`}>
            {col.map((ch) => (
              <div key={ch.id} onClick={(e) => { e.stopPropagation(); setSelectedId(ch.id) }}
                className={cn("group/child relative rounded my-1 cursor-pointer", ch.id === selectedId ? "outline outline-2 outline-blue-500" : "hover:outline hover:outline-1 hover:outline-blue-200")}>
                <button onClick={(e) => { e.stopPropagation(); remove(ch.id) }} className="absolute -top-1.5 right-1 z-10 p-0.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-red-500 opacity-0 group-hover/child:opacity-100"><Trash2 className="h-3 w-3" /></button>
                <div className="p-0.5" dangerouslySetInnerHTML={{ __html: preview(ch) }} />
              </div>
            ))}
            {col.length === 0 && <div className="text-center text-[10px] text-slate-300 py-3">Drop here</div>}
          </Cell>
        ))}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-full min-h-0">
        {/* Palette */}
        <div className="w-40 shrink-0 space-y-1.5 overflow-y-auto">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Modules</p>
          {palette.map((p) => <PaletteChip key={p.type} item={p} onAdd={() => add(p.type, defaultRegion())} />)}
          <p className="text-[10px] text-slate-400 pt-1">Drag onto the canvas (or into a column), or click to add.</p>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-slate-100 rounded-xl p-6" onClick={() => setSelectedId(null)}>
          <div className="mx-auto bg-white shadow-sm" style={{ width: pageWidth, ...pageStyle }}>
            {regionList.map((r) => (
              <RegionZone key={r.key} region={r} showLabel={regioned} ids={idsIn(r.key)}>
                {blocks.filter((b) => regionOf(b) === r.key).map((b) => (
                  <SortableBlock key={b.id} id={b.id} selected={b.id === selectedId}
                    onSelect={() => setSelectedId(b.id)} onDelete={() => remove(b.id)} onDuplicate={() => duplicate(b.id)}>
                    {renderBody(b)}
                  </SortableBlock>
                ))}
                {idsIn(r.key).length === 0 && <div className="text-center text-xs text-slate-300 py-6">Drag a module here</div>}
                {regioned && (
                  <div className="flex flex-wrap gap-1 px-3 pb-2 opacity-60 hover:opacity-100">
                    {palette.map((p) => <button key={p.type} onClick={(e) => { e.stopPropagation(); add(p.type, r.key) }} className="text-[10px] text-blue-600 hover:underline">+ {p.label}</button>)}
                  </div>
                )}
              </RegionZone>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="w-72 shrink-0 overflow-y-auto">
          {selected ? (
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{selected.type} settings</p>
              {renderSettings(selected, (p) => patch(selected.id, p))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-400 text-center">Select a block on the canvas to edit it.</div>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? <div className="rounded-md bg-white border border-blue-300 shadow px-3 py-2 text-xs text-slate-600">{active.type}</div> : null}
      </DragOverlay>
    </DndContext>
  )
}

function PaletteChip({ item, onAdd }: { item: PaletteItem; onAdd: () => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `new:${item.type}` })
  const Icon = item.icon
  return (
    <button ref={setNodeRef} {...attributes} {...listeners} onClick={onAdd}
      className={cn("w-full inline-flex items-center gap-2 h-9 px-2.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 cursor-grab", isDragging && "opacity-40")}>
      <Icon className="h-3.5 w-3.5 text-slate-400" /> {item.label}
    </button>
  )
}

function Cell({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return <div ref={setNodeRef} className={cn("flex-1 min-w-0 rounded border border-dashed p-1", isOver ? "border-blue-400 bg-blue-50/40" : "border-slate-200")}>{children}</div>
}

function RegionZone({ region, showLabel, ids, children }: { region: CanvasRegion; showLabel: boolean; ids: string[]; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `region:${region.key}` })
  return (
    <div ref={setNodeRef}>
      {showLabel && (
        <div className="px-4 pt-3 pb-1 border-t border-slate-100 first:border-t-0">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{region.label}</span>
          {region.hint && <span className="text-[10px] text-slate-300 ml-2">{region.hint}</span>}
        </div>
      )}
      <div className="px-4 py-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
      </div>
    </div>
  )
}

function SortableBlock({ id, selected, onSelect, onDelete, onDuplicate, children }: {
  id: string; selected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void; children: React.ReactNode
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      className={cn("group relative rounded-md my-1 outline-offset-2", selected ? "outline outline-2 outline-blue-500" : "hover:outline hover:outline-1 hover:outline-blue-200")}>
      <div className={cn("absolute -top-2 right-2 z-10 flex items-center gap-0.5 bg-white border border-slate-200 rounded-md shadow-sm px-1 py-0.5 transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="p-1 text-slate-400 hover:text-slate-700 cursor-grab" title="Drag"><GripVertical className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate() }} className="p-1 text-slate-400 hover:text-slate-700" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1 text-slate-400 hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {children}
    </div>
  )
}
