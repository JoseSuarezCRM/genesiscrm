"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable,
  closestCenter, pointerWithin, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Eye, EyeOff, Plus, Link2, Trash2, Pencil, Loader2, RotateCcw, ArrowUpRight, Lock, ChevronRight } from "lucide-react"
import IconPicker from "@/components/ui/icon-picker"
import StyledSelect from "@/components/ui/styled-select"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { saveNavLayout, resetNavLayout } from "@/app/actions/nav-layout"
import { UNHIDEABLE_ITEMS } from "@/lib/nav-catalog"
import { allNavItems, resolveNav, visibleNav, isSafeLinkUrl, type NavLayoutData, type NavLink } from "@/lib/nav-layout"
import { navIcon } from "@/lib/nav-icons"
import { cn } from "@/lib/utils"

// ── Working copy ──────────────────────────────────────────────────────────────

interface EdSection { id: string; title: string; icon: string; custom: boolean; defaultTitle: string | null; defaultIcon: string | null; items: string[] }
interface EdState { sections: EdSection[]; labels: Record<string, string>; hidden: string[]; links: NavLink[] }

type CustomObj = { key: string; plural: string }

function stateFrom(layout: NavLayoutData | null, customObjects: CustomObj[]): EdState {
  return {
    sections: resolveNav(layout, customObjects).map((s) => ({
      id: s.id, title: s.title, icon: s.icon, custom: s.custom, defaultTitle: s.defaultTitle, defaultIcon: s.defaultIcon,
      items: s.items.map((it) => it.id),
    })),
    labels: { ...(layout?.labels ?? {}) },
    hidden: [...(layout?.hidden ?? [])],
    links: [...(layout?.links ?? [])],
  }
}

/** What gets saved: only what differs from the defaults, plus every placement. */
function layoutFrom(st: EdState): NavLayoutData {
  return {
    version: 1,
    sections: st.sections.map((s) => ({
      id: s.id,
      ...(s.custom || s.title !== s.defaultTitle ? { title: s.title } : {}),
      ...(s.custom || s.icon !== s.defaultIcon ? { icon: s.icon } : {}),
      items: s.items,
    })),
    labels: st.labels,
    hidden: st.hidden,
    links: st.links,
  }
}

const newId = (prefix: "custom" | "ext") => `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const SECTION_PREFIX = "section:"
const ZONE_PREFIX = "zone:"

// ── Editor ────────────────────────────────────────────────────────────────────

export default function NavigationSettings({ initialLayout, customObjects }: { initialLayout: NavLayoutData | null; customObjects: CustomObj[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<EdState>(() => stateFrom(initialLayout, customObjects))
  const [baseline, setBaseline] = useState(() => JSON.stringify(layoutFrom(stateFrom(initialLayout, customObjects))))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [activeDrag, setActiveDrag] = useState<string | null>(null)
  const [sectionDialog, setSectionDialog] = useState<{ id: string | null; title: string; icon: string } | null>(null)
  const [linkDialog, setLinkDialog] = useState<{ id: string | null; label: string; url: string; section: string } | null>(null)

  const layout = useMemo(() => layoutFrom(state), [state])
  const dirty = JSON.stringify(layout) !== baseline
  const itemsById = useMemo(() => new Map(allNavItems(customObjects, state.links).map((it) => [it.id, it])), [customObjects, state.links])
  // What someone with access to everything will see.
  const preview = useMemo(() => visibleNav(resolveNav(layout, customObjects), { role: "ADMIN" }), [layout, customObjects])

  // Don't lose an arrangement to a stray click away.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  useEffect(() => { if (dirty) setSaved(false) }, [dirty])

  const update = (fn: (s: EdState) => EdState) => { setError(null); setState(fn) }
  const sectionOf = (itemId: string) => state.sections.find((s) => s.items.includes(itemId))

  // ── Drag and drop ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor))
  // Sections only collide with sections; items with items, then a section's drop zone.
  const collision: CollisionDetection = (args) => {
    const draggingSection = String(args.active.id).startsWith(SECTION_PREFIX)
    const of = (pred: (id: string) => boolean) => args.droppableContainers.filter((c) => pred(String(c.id)))
    if (draggingSection) return closestCenter({ ...args, droppableContainers: of((id) => id.startsWith(SECTION_PREFIX)) })
    const items = of((id) => !id.startsWith(SECTION_PREFIX) && !id.startsWith(ZONE_PREFIX))
    const zones = of((id) => id.startsWith(ZONE_PREFIX))
    const onItem = pointerWithin({ ...args, droppableContainers: items })
    if (onItem.length) return onItem
    const onZone = pointerWithin({ ...args, droppableContainers: zones })
    if (onZone.length) return onZone
    return closestCenter({ ...args, droppableContainers: [...items, ...zones] })
  }

  function onDragStart(e: DragStartEvent) { setActiveDrag(String(e.active.id)) }

  function onDragEnd(e: DragEndEvent) {
    setActiveDrag(null)
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId || activeId === overId) return

    if (activeId.startsWith(SECTION_PREFIX)) {
      const from = state.sections.findIndex((s) => SECTION_PREFIX + s.id === activeId)
      const to = state.sections.findIndex((s) => SECTION_PREFIX + s.id === overId)
      if (from < 0 || to < 0) return
      update((s) => ({ ...s, sections: arrayMove(s.sections, from, to) }))
      return
    }

    const fromSection = sectionOf(activeId)
    const toSectionId = overId.startsWith(ZONE_PREFIX) ? overId.slice(ZONE_PREFIX.length) : sectionOf(overId)?.id
    if (!fromSection || !toSectionId) return
    update((s) => {
      const sections = s.sections.map((sec) => ({ ...sec, items: [...sec.items] }))
      const src = sections.find((x) => x.id === fromSection.id)!
      const dst = sections.find((x) => x.id === toSectionId)!
      if (src === dst) {
        if (overId.startsWith(ZONE_PREFIX)) return s
        dst.items = arrayMove(dst.items, dst.items.indexOf(activeId), dst.items.indexOf(overId))
      } else {
        src.items = src.items.filter((id) => id !== activeId)
        const at = overId.startsWith(ZONE_PREFIX) ? dst.items.length : Math.max(0, dst.items.indexOf(overId))
        dst.items.splice(at, 0, activeId)
      }
      return { ...s, sections }
    })
  }

  // ── Edits ──
  const setSection = (id: string, patch: Partial<EdSection>) =>
    update((s) => ({ ...s, sections: s.sections.map((sec) => (sec.id === id ? { ...sec, ...patch } : sec)) }))

  const renameItem = (id: string, label: string) => update((s) => {
    const labels = { ...s.labels }
    const original = itemsById.get(id)?.label
    const clean = label.trim().replace(/\s+/g, " ")
    if (!clean || clean === original) delete labels[id]
    else labels[id] = clean
    return { ...s, labels }
  })

  const toggleHidden = (id: string) => update((s) => ({
    ...s, hidden: s.hidden.includes(id) ? s.hidden.filter((x) => x !== id) : [...s.hidden, id],
  }))

  async function deleteSection(sec: EdSection) {
    const links = sec.items.filter((id) => itemsById.get(id)?.external)
    const ok = await confirmDialog({
      title: `Delete "${sec.title}"?`,
      description: `Its pages go back to their usual sections.${links.length ? ` Its ${links.length === 1 ? "link is" : `${links.length} links are`} removed.` : ""}`,
      confirmLabel: "Delete section",
      destructive: true,
    })
    if (!ok) return
    update((s) => {
      const sections = s.sections.filter((x) => x.id !== sec.id).map((x) => ({ ...x, items: [...x.items] }))
      for (const id of sec.items) {
        const def = itemsById.get(id)
        if (!def || def.external) continue
        sections.find((x) => x.id === def.section)?.items.push(id)
      }
      return {
        ...s,
        sections,
        links: s.links.filter((l) => !links.includes(l.id)),
        hidden: s.hidden.filter((h) => !links.includes(h)),
      }
    })
  }

  function saveSectionDialog() {
    if (!sectionDialog) return
    const title = sectionDialog.title.trim()
    if (!title) return
    if (sectionDialog.id) setSection(sectionDialog.id, { title, icon: sectionDialog.icon })
    else update((s) => ({
      ...s,
      sections: [...s.sections, { id: newId("custom"), title, icon: sectionDialog.icon, custom: true, defaultTitle: null, defaultIcon: null, items: [] }],
    }))
    setSectionDialog(null)
  }

  const linkError = linkDialog
    ? (!linkDialog.label.trim() ? "Give the link a name." : !isSafeLinkUrl(linkDialog.url.trim()) ? "Use a full web address, starting with https://" : null)
    : null

  function saveLinkDialog() {
    if (!linkDialog || linkError) return
    const label = linkDialog.label.trim()
    const url = linkDialog.url.trim()
    update((s) => {
      if (linkDialog.id) {
        const id = linkDialog.id
        const sections = s.sections.map((sec) => ({ ...sec, items: sec.items.filter((x) => x !== id) }))
        sections.find((x) => x.id === linkDialog.section)?.items.push(id)
        return { ...s, sections, links: s.links.map((l) => (l.id === id ? { ...l, label, url } : l)) }
      }
      const id = newId("ext")
      return {
        ...s,
        links: [...s.links, { id, label, url }],
        sections: s.sections.map((sec) => (sec.id === linkDialog.section ? { ...sec, items: [...sec.items, id] } : sec)),
      }
    })
    setLinkDialog(null)
  }

  async function deleteLink(id: string) {
    const link = state.links.find((l) => l.id === id)
    if (!(await confirmDialog({ title: `Remove "${link?.label}"?`, confirmLabel: "Remove", destructive: true }))) return
    update((s) => ({
      ...s,
      links: s.links.filter((l) => l.id !== id),
      hidden: s.hidden.filter((h) => h !== id),
      sections: s.sections.map((sec) => ({ ...sec, items: sec.items.filter((x) => x !== id) })),
    }))
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await saveNavLayout(layout)
      if ("error" in res) { setError(res.error); return }
      setBaseline(JSON.stringify(layout))
      setSaved(true)
      router.refresh()
    })
  }

  async function reset() {
    const ok = await confirmDialog({
      title: "Reset the menu to the default?",
      description: "Every section, name, icon, hidden item and link you've set goes back to how the CRM ships it — for everyone.",
      confirmLabel: "Reset",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      await resetNavLayout()
      const fresh = stateFrom(null, customObjects)
      setState(fresh)
      setBaseline(JSON.stringify(layoutFrom(fresh)))
      setError(null)
      setSaved(true)
      router.refresh()
    })
  }

  const draggingItem = activeDrag && !activeDrag.startsWith(SECTION_PREFIX) ? itemsById.get(activeDrag) : null
  const draggingSection = activeDrag?.startsWith(SECTION_PREFIX) ? state.sections.find((s) => SECTION_PREFIX + s.id === activeDrag) : null

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <button onClick={() => setSectionDialog({ id: null, title: "", icon: "Star" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          <Plus className="h-4 w-4" /> New section
        </button>
        <button onClick={() => setLinkDialog({ id: null, label: "", url: "https://", section: state.sections[0]?.id ?? "" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          <Link2 className="h-4 w-4" /> Add link
        </button>
        <div className="flex-1" />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {!error && dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
        {!error && !dirty && saved && <span className="text-xs text-emerald-600">Saved — everyone's menu is updated</span>}
        <button onClick={reset} disabled={isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50">
          <RotateCcw className="h-3.5 w-3.5" /> Reset to default
        </button>
        <button onClick={save} disabled={!dirty || isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Editor */}
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
          <SortableContext items={state.sections.map((s) => SECTION_PREFIX + s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {state.sections.map((sec) => (
                <SectionCard
                  key={sec.id}
                  section={sec}
                  onIcon={(icon) => setSection(sec.id, { icon })}
                  onTitle={(title) => setSection(sec.id, { title: title.trim() || sec.defaultTitle || sec.title })}
                  onReset={() => setSection(sec.id, { title: sec.defaultTitle ?? sec.title, icon: sec.defaultIcon ?? sec.icon })}
                  onDelete={sec.custom ? () => deleteSection(sec) : undefined}
                >
                  {sec.items.map((id) => {
                    const def = itemsById.get(id)
                    if (!def) return null
                    return (
                      <ItemRow
                        key={id}
                        id={id}
                        label={def.external ? def.label : (state.labels[id] ?? def.label)}
                        original={def.external ? null : def.label}
                        destination={def.external ? hostOf(def.href) : def.href}
                        external={!!def.external}
                        hidden={state.hidden.includes(id)}
                        lockedVisible={UNHIDEABLE_ITEMS.has(id)}
                        onRename={(label) => renameItem(id, label)}
                        onToggleHidden={() => toggleHidden(id)}
                        onEditLink={def.external ? () => {
                          const link = state.links.find((l) => l.id === id)!
                          setLinkDialog({ id, label: link.label, url: link.url, section: sec.id })
                        } : undefined}
                        onDeleteLink={def.external ? () => deleteLink(id) : undefined}
                      />
                    )
                  })}
                </SectionCard>
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {draggingItem && (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-lg">
                <GripVertical className="h-3.5 w-3.5 text-zinc-400" />
                {draggingItem.external ? draggingItem.label : (state.labels[draggingItem.id] ?? draggingItem.label)}
              </div>
            )}
            {draggingSection && (() => {
              const Icon = navIcon(draggingSection.icon)
              return (
                <div className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 shadow-lg">
                  <Icon className="h-4 w-4" /> {draggingSection.title}
                </div>
              )
            })()}
          </DragOverlay>
        </DndContext>

        {/* Live preview */}
        <Preview sections={preview} />
      </div>

      {/* New / edit section */}
      <Dialog open={!!sectionDialog} onOpenChange={(o) => !o && setSectionDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{sectionDialog?.id ? "Edit section" : "New section"}</DialogTitle></DialogHeader>
          {sectionDialog && (
            <div className="space-y-2 py-2">
              <label className="block text-xs font-medium text-zinc-600">Icon and name</label>
              <div className="flex items-center gap-2">
                <IconPicker value={sectionDialog.icon} onChange={(icon) => setSectionDialog({ ...sectionDialog, icon })} />
                <input autoFocus value={sectionDialog.title} maxLength={40} placeholder="Athletes"
                  onChange={(e) => setSectionDialog({ ...sectionDialog, title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveSectionDialog() }}
                  className="h-9 flex-1 rounded-lg border border-zinc-200 px-3 text-sm focus:border-zinc-400 focus:outline-none" />
              </div>
              {!sectionDialog.id && <p className="text-xs text-zinc-500">It's added at the bottom of the menu. Drag pages into it, and the section up or down.</p>}
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setSectionDialog(null)} className="h-9 px-3 text-sm text-zinc-600 hover:text-zinc-800">Cancel</button>
            <button onClick={saveSectionDialog} disabled={!sectionDialog?.title.trim()}
              className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
              {sectionDialog?.id ? "Done" : "Add section"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New / edit link */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{linkDialog?.id ? "Edit link" : "Add link"}</DialogTitle></DialogHeader>
          {linkDialog && (
            <div className="space-y-3 py-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Name</label>
                <input autoFocus value={linkDialog.label} maxLength={60} placeholder="Epic"
                  onChange={(e) => setLinkDialog({ ...linkDialog, label: e.target.value })}
                  className="h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-zinc-400 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Web address</label>
                <input value={linkDialog.url} placeholder="https://"
                  onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveLinkDialog() }}
                  className="h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-zinc-400 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Section</label>
                <StyledSelect searchable value={linkDialog.section} onChange={(e) => setLinkDialog({ ...linkDialog, section: e.target.value })} className="w-full">
                  {state.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </StyledSelect>
              </div>
              <p className="text-xs text-zinc-500">Opens in a new tab. Everyone who sees that section sees the link.</p>
              {linkDialog.label.trim() && linkDialog.url.trim() && linkDialog.url.trim() !== "https://" && linkError && (
                <p role="alert" className="text-xs text-red-600">{linkError}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setLinkDialog(null)} className="h-9 px-3 text-sm text-zinc-600 hover:text-zinc-800">Cancel</button>
            <button onClick={saveLinkDialog} disabled={!!linkError}
              className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40">
              {linkDialog?.id ? "Done" : "Add link"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ section, onIcon, onTitle, onReset, onDelete, children }: {
  section: EdSection
  onIcon: (icon: string) => void
  onTitle: (title: string) => void
  /** Back to the CRM's name and icon (built-in sections). */
  onReset: () => void
  onDelete?: () => void
  children: React.ReactNode
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: SECTION_PREFIX + section.id })
  const zone = useDroppable({ id: ZONE_PREFIX + section.id })
  const [title, setTitle] = useState(section.title)
  useEffect(() => setTitle(section.title), [section.title])
  const renamed = !section.custom && section.title !== section.defaultTitle
  const reiconed = !section.custom && section.icon !== section.defaultIcon

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("overflow-hidden rounded-xl border border-zinc-200 bg-white", isDragging && "opacity-40")}>
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
        <button {...attributes} {...listeners} title="Drag to reorder sections"
          className="cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        <IconPicker value={section.icon} onChange={onIcon} size="sm" />
        <input
          value={title}
          maxLength={40}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onTitle(title)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-zinc-800 hover:border-zinc-200 focus:border-zinc-400 focus:bg-white focus:outline-none"
        />
        {renamed && <span className="shrink-0 text-[11px] text-zinc-400">Originally “{section.defaultTitle}”</span>}
        {(renamed || reiconed) && (
          <button onClick={onReset} title="Back to the default name and icon"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="shrink-0 text-xs tabular-nums text-zinc-400">{section.items.length}</span>
        {onDelete && (
          <button onClick={onDelete} title="Delete section"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div ref={zone.setNodeRef} className={cn("min-h-[44px] divide-y divide-zinc-100 transition-colors", zone.isOver && "bg-blue-50/50")}>
        <SortableContext items={section.items} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
        {section.items.length === 0 && (
          <p className="px-4 py-3 text-center text-xs text-zinc-400">Drop pages here. An empty section doesn't show in the menu.</p>
        )}
      </div>
    </div>
  )
}

// ── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({ id, label, original, destination, external, hidden, lockedVisible, onRename, onToggleHidden, onEditLink, onDeleteLink }: {
  id: string
  label: string
  /** The CRM's name, for a built-in page; null for a link. */
  original: string | null
  destination: string
  external: boolean
  hidden: boolean
  lockedVisible: boolean
  onRename: (label: string) => void
  onToggleHidden: () => void
  onEditLink?: () => void
  onDeleteLink?: () => void
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const renamed = original !== null && label !== original

  function commit() { setEditing(false); if (draft !== label) onRename(draft) }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group flex items-center gap-2 bg-white px-3 py-2", isDragging && "opacity-40")}>
      <button {...attributes} {...listeners} title="Drag to move" className="cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className={cn("min-w-0 flex-1", hidden && "opacity-50")}>
        {editing ? (
          <input autoFocus value={draft} maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(label); setEditing(false) } }}
            className="h-7 w-full rounded-md border border-zinc-300 px-2 text-sm focus:border-zinc-500 focus:outline-none" />
        ) : (
          <button onClick={() => (external ? onEditLink?.() : (setDraft(label), setEditing(true)))} title={external ? "Edit link" : "Rename"}
            className="flex max-w-full items-center gap-1.5 text-left">
            <span className="truncate text-sm font-medium text-zinc-800">{label}</span>
            {external && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
            <Pencil className="h-3 w-3 shrink-0 text-zinc-300 opacity-0 group-hover:opacity-100" />
          </button>
        )}
        <p className="truncate text-xs text-zinc-400">
          {renamed && <>Originally “{original}” · </>}{destination}
        </p>
      </div>
      {hidden && <span className="shrink-0 text-[10px] font-medium uppercase text-zinc-500">Hidden</span>}
      {lockedVisible ? (
        <span title="Settings always shows — it's how admins get back here." className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-zinc-300">
          <Lock className="h-3.5 w-3.5" />
        </span>
      ) : (
        <button onClick={onToggleHidden} title={hidden ? "Show in the menu" : "Hide from the menu"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
      {onDeleteLink ? (
        <button onClick={onDeleteLink} title="Remove link"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : <span className="w-8 shrink-0" />}
    </div>
  )
}

// ── Live preview ──────────────────────────────────────────────────────────────

function Preview({ sections }: { sections: ReturnType<typeof visibleNav> }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="lg:sticky lg:top-4 lg:self-start">
      <p className="mb-2 text-xs font-medium text-zinc-500">Preview</p>
      <div className="rounded-xl bg-slate-900 p-2 text-white">
        {sections.map((s) => {
          const Icon = navIcon(s.icon)
          const isOpen = open === s.id
          return (
            <div key={s.id}>
              <button onClick={() => setOpen(isOpen ? null : s.id)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isOpen ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white")}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">{s.title}</span>
                <ChevronRight className={cn("h-3.5 w-3.5 text-slate-500 transition-transform", isOpen && "rotate-90")} />
              </button>
              {isOpen && (
                <div className="mb-1 ml-7 space-y-0.5 border-l border-slate-700 py-1 pl-2">
                  {s.items.map((it) => (
                    <p key={it.id} className="flex items-center gap-1 truncate px-2 py-1 text-xs text-slate-300">
                      <span className="truncate">{it.label}</span>
                      {it.external && <ArrowUpRight className="h-3 w-3 shrink-0 text-slate-500" />}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-400">
        What someone with access to everything sees. Others see only the pages they can open; an empty section disappears.
      </p>
    </div>
  )
}
