"use client"

import React, { useState } from "react"
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
  useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Copy, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Generic HubSpot-style visual builder: a left module palette, a center WYSIWYG
// canvas that renders each block's real output (via `preview`), and a right
// settings panel for the selected block. Blocks reorder by drag; palette items
// add by click or drag onto the canvas. Optional regions (header/body/footer).

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
  const [active, setActive] = useState<B | { type: string } | null>(null)

  const selected = blocks.find((b) => b.id === selectedId) ?? null
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor))

  const patch = (id: string, p: Partial<B>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const remove = (id: string) => { onChange(blocks.filter((b) => b.id !== id)); if (selectedId === id) setSelectedId(null) }
  const duplicate = (id: string) => {
    const b = blocks.find((x) => x.id === id); if (!b) return
    const copy = { ...b, id: `${b.id}_c${Math.random().toString(36).slice(2, 6)}` } as B
    const i = blocks.indexOf(b)
    onChange([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)])
  }
  // Append a new block to a region (click-add).
  const add = (type: string, region: string) => {
    const nb = makeBlock(type, region)
    onChange([...blocks, nb]); setSelectedId(nb.id)
  }
  const defaultRegion = () => (selected ? regionOf(selected) : (regionList.find((r) => r.key === "body")?.key ?? regionList[0].key))

  function idsIn(regionKey: string): string[] { return blocks.filter((b) => regionOf(b) === regionKey).map((b) => b.id) }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id)
    if (id.startsWith("new:")) setActive({ type: id.slice(4) })
    else setActive(blocks.find((b) => b.id === id) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null)
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId) return

    // Resolve the target region + index from the drop target.
    const overRegion = overId.startsWith("region:") ? overId.slice(7) : (blocks.find((b) => b.id === overId) ? regionOf(blocks.find((b) => b.id === overId)!) : null)
    if (!overRegion) return
    const overIds = idsIn(overRegion)
    const overIndex = overId.startsWith("region:") ? overIds.length : overIds.indexOf(overId)

    if (activeId.startsWith("new:")) {
      const type = activeId.slice(4)
      const nb = makeBlock(type, overRegion)
      // Insert relative to the flat array at the over block's position.
      const flatIndex = overId.startsWith("region:")
        ? (overIds.length ? blocks.indexOf(blocks.find((b) => b.id === overIds[overIds.length - 1])!) + 1 : blocks.length)
        : blocks.indexOf(blocks.find((b) => b.id === overId)!)
      const next = [...blocks]; next.splice(Math.max(0, flatIndex), 0, nb)
      onChange(next); setSelectedId(nb.id); return
    }

    if (activeId === overId) return
    const moving = blocks.find((b) => b.id === activeId); if (!moving) return
    const fromRegion = regionOf(moving)
    if (fromRegion === overRegion) {
      // Reorder within the region.
      const ids = overIds
      const next = arrayMove(ids, ids.indexOf(activeId), overIndex < 0 ? ids.length - 1 : overIndex)
      // Rebuild the flat array with this region reordered, others untouched (grouped).
      const map = new Map(blocks.map((b) => [b.id, b]))
      onChange(regionList.flatMap((r) => (r.key === overRegion ? next.map((id) => map.get(id)!) : blocks.filter((b) => regionOf(b) === r.key))))
    } else {
      // Move to another region at the over position.
      const moved = { ...moving, region: overRegion } as B
      const rest = blocks.filter((b) => b.id !== activeId)
      const targetIds = rest.filter((b) => regionOf(b) === overRegion).map((b) => b.id)
      const insertAt = overId.startsWith("region:") ? targetIds.length : Math.max(0, targetIds.indexOf(overId))
      targetIds.splice(insertAt, 0, moved.id)
      const map = new Map([...rest, moved].map((b) => [b.id, b]))
      onChange(regionList.flatMap((r) => (r.key === overRegion ? targetIds.map((id) => map.get(id)!) : rest.filter((b) => regionOf(b) === r.key))))
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 h-[calc(100vh-190px)] min-h-[520px]">
        {/* Palette */}
        <div className="w-40 shrink-0 space-y-1.5 overflow-y-auto">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Modules</p>
          {palette.map((p) => <PaletteChip key={p.type} item={p} onAdd={() => add(p.type, defaultRegion())} />)}
          <p className="text-[10px] text-slate-400 pt-1">Drag onto the canvas, or click to add.</p>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-slate-100 rounded-xl p-6" onClick={() => setSelectedId(null)}>
          <div className="mx-auto bg-white shadow-sm" style={{ width: pageWidth, ...pageStyle }}>
            {regionList.map((r) => (
              <RegionZone key={r.key} region={r} showLabel={regioned} ids={idsIn(r.key)}>
                {blocks.filter((b) => regionOf(b) === r.key).map((b) => (
                  <SortableBlock key={b.id} id={b.id} selected={b.id === selectedId}
                    onSelect={() => setSelectedId(b.id)} onDelete={() => remove(b.id)} onDuplicate={() => duplicate(b.id)}
                    html={preview(b)} />
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
        {active ? <div className="rounded-md bg-white border border-blue-300 shadow px-3 py-2 text-xs text-slate-600">{"id" in active ? (active as B).type : (active as any).type}</div> : null}
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

function SortableBlock({ id, selected, onSelect, onDelete, onDuplicate, html }: {
  id: string; selected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void; html: string
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      className={cn("group relative rounded-md my-1 outline-offset-2", selected ? "outline outline-2 outline-blue-500" : "hover:outline hover:outline-1 hover:outline-blue-200")}>
      {/* hover toolbar */}
      <div className={cn("absolute -top-2 right-2 z-10 flex items-center gap-0.5 bg-white border border-slate-200 rounded-md shadow-sm px-1 py-0.5 transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <button {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} className="p-1 text-slate-400 hover:text-slate-700 cursor-grab" title="Drag"><GripVertical className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate() }} className="p-1 text-slate-400 hover:text-slate-700" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1 text-slate-400 hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-1" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
