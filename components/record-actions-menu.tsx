"use client"

import { useState, useEffect, useRef, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, List, Copy, GitMerge, Trash2, Loader2, X, Search } from "lucide-react"
import { deleteRecord, cloneRecord, mergeRecord } from "@/app/actions/record-crud"
import { isMergeable } from "@/lib/record-urls"
import { searchAssociableRecords } from "@/app/actions/associations"
import { getRecordValues } from "@/app/actions/record-fields"
import { listUrlFor } from "@/lib/record-urls"
import { type RecordFieldDef, isPropertyVisible } from "@/lib/record-field-catalog"
import { cn } from "@/lib/utils"

interface Props {
  entityType: string
  recordId: string
  title: string
  catalog: RecordFieldDef[]
  values: Record<string, any>
  userMap?: Record<string, string>
  canEdit: boolean
  canDelete: boolean
  /** Whether to show the Clone item (some objects don't support cloning). */
  cloneable?: boolean
  /** Extra menu items rendered at the top; receives a `close` to dismiss the menu. */
  extraItems?: (close: () => void) => ReactNode
}

// Shared menu-item classes so callers building extraItems match the native items.
export const RECORD_ACTION_ITEM = "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"

function fmt(f: RecordFieldDef, v: any, userMap: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "—"
  if (f.type === "user") return userMap[v] ?? String(v)
  if (f.type === "datetime") return new Date(v).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  if (f.type === "date") return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  if (Array.isArray(v)) return v.join(", ")
  return String(v)
}

export default function RecordActionsMenu({ entityType, recordId, title, catalog, values, userMap = {}, canEdit, canDelete, cloneable = true, extraItems }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState(false)
  const [merging, setMerging] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)
  const mergeable = isMergeable(entityType)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  function clone() {
    setOpen(false)
    startTransition(async () => {
      const res = await cloneRecord(entityType, recordId)
      if (res.error) alert(res.error)
      else if (res.url) router.push(res.url)
    })
  }

  function confirmDelete() {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const res = await deleteRecord(entityType, recordId)
        if (res.error) { alert(res.error); resolve() }
        else router.push(listUrlFor(entityType))
      })
    })
  }

  const item = "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors"

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Actions"}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden py-1">
          {extraItems && (
            <>
              {extraItems(() => setOpen(false))}
              <div className="my-1 border-t border-slate-100" />
            </>
          )}
          <button className={item} onClick={() => { setOpen(false); setPanel(true) }}>
            <List className="h-4 w-4 text-slate-400" /> View all properties
          </button>
          {canEdit && cloneable && (
            <button className={item} onClick={clone}>
              <Copy className="h-4 w-4 text-slate-400" /> Clone
            </button>
          )}
          {canEdit && mergeable && (
            <button className={item} onClick={() => { setOpen(false); setMerging(true) }}>
              <GitMerge className="h-4 w-4 text-slate-400" /> Merge
            </button>
          )}
          <div className="my-1 border-t border-slate-100" />
          <button
            className={cn(item, canDelete ? "text-red-600" : "text-slate-300 cursor-not-allowed hover:bg-transparent")}
            disabled={!canDelete}
            title={canDelete ? undefined : "You don't have permission to delete this"}
            onClick={() => { if (!canDelete) return; setOpen(false); setDeleting(true) }}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}

      {panel && <AllPropertiesPanel title={title} catalog={catalog} values={values} userMap={userMap} onClose={() => setPanel(false)} />}
      {merging && <MergeDialog entityType={entityType} recordId={recordId} title={title} catalog={catalog} values={values} userMap={userMap} onClose={() => setMerging(false)} />}
      {deleting && <DeleteDialog title={title} isPending={isPending} onConfirm={confirmDelete} onClose={() => setDeleting(false)} />}
    </div>
  )
}

// Type-DELETE-to-confirm gate before a record is permanently removed.
function DeleteDialog({ title, isPending, onConfirm, onClose }: {
  title: string; isPending: boolean; onConfirm: () => void; onClose: () => void
}) {
  const [text, setText] = useState("")
  const ok = text.trim().toUpperCase() === "DELETE"
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 animate-modal-in">
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0"><Trash2 className="h-4 w-4" /></span>
          <h2 className="text-base font-semibold text-slate-900">Delete this record?</h2>
        </div>
        <p className="text-sm text-slate-500">
          You're about to permanently delete <span className="font-medium text-slate-800">{title}</span>. This can't be undone.
          Type <span className="font-mono font-semibold text-slate-800">DELETE</span> to confirm.
        </p>
        <input
          autoFocus value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ok && !isPending) onConfirm() }}
          placeholder="DELETE"
          className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-red-400" />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={onConfirm} disabled={!ok || isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// Merge two records: search for the other, then a side-by-side preview where you
// pick which record survives (the primary). The other's links move to it, and it
// fills the primary's blank fields.
function MergeDialog({ entityType, recordId, title, catalog, values, userMap, onClose }: {
  entityType: string; recordId: string; title: string; catalog: RecordFieldDef[]; values: Record<string, any>; userMap: Record<string, string>; onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [otherValues, setOtherValues] = useState<Record<string, any> | null>(null)
  // Which record survives: "this" (the one you opened) or "other" (the picked one).
  const [primary, setPrimary] = useState<"this" | "other">("this")
  // Per-field winner. Undefined = follow the primary; set to override one field.
  const [choices, setChoices] = useState<Record<string, "this" | "other">>({})
  const [error, setError] = useState<string | null>(null)

  function choosePrimary(side: "this" | "other") {
    setPrimary(side)
    setChoices({}) // switching the primary resets all per-field overrides to it
  }

  function search(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setResults([]); return }
    startTransition(async () => {
      const rows = await searchAssociableRecords(entityType, value)
      setResults(rows.filter((r) => r.id !== recordId))
    })
  }

  function pick(r: { id: string; name: string }) {
    setResults([]); setQ(""); setPicked(r); setOtherValues(null)
    startTransition(async () => setOtherValues(await getRecordValues(entityType, r.id)))
  }

  // Only real data fields — skip owner/audit meta and rule-hidden properties.
  const fields = catalog.filter((f) => !f.key.startsWith("__") && isPropertyVisible((f as any).visibilityRule, values))
  const rawFor = (side: "this" | "other", key: string) => (side === "this" ? values : otherValues ?? {})[key]

  function doMerge() {
    if (!picked) return
    setError(null)
    const survivorId = primary === "this" ? recordId : picked.id
    const loserId = primary === "this" ? picked.id : recordId

    // Send only the fields the user pointed away from the survivor.
    const overrides: Record<string, any> = {}
    for (const f of fields) {
      const eff = choices[f.key] ?? primary
      if (eff !== primary) {
        const raw = rawFor(eff, f.key)
        overrides[f.key] = (f.type === "date" || f.type === "datetime") && raw ? new Date(raw).toISOString() : raw
      }
    }
    startTransition(async () => {
      const res = await mergeRecord(entityType, loserId, survivorId, overrides)
      if (res.error) setError(res.error)
      else if (res.url) { onClose(); router.push(res.url) }
    })
  }

  const Head = ({ side, name }: { side: "this" | "other"; name: string }) => (
    <button onClick={() => choosePrimary(side)}
      className={cn("flex-1 min-w-0 text-left px-3 py-2 rounded-lg border transition-colors",
        primary === side ? "border-blue-600 bg-zinc-50" : "border-slate-200 hover:border-slate-300")}>
      <span className={cn("flex items-center gap-1.5 text-xs font-medium", primary === side ? "text-zinc-900" : "text-slate-500")}>
        <span className={cn("h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0", primary === side ? "border-blue-600" : "border-slate-300")}>
          {primary === side && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
        </span>
        {primary === side ? "Primary — kept" : "Merged in"}
      </span>
      <span className="block text-sm font-semibold text-slate-900 truncate mt-0.5">{name}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] animate-modal-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Merge records</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        {!picked ? (
          <div className="p-5 space-y-2">
            <p className="text-sm text-slate-500">Find the record to merge with <span className="font-medium text-slate-800">{title}</span>.</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search a record…" autoFocus
                className="w-full h-9 pl-8 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            </div>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            <div className="max-h-60 overflow-y-auto">
              {results.map((r) => (
                <button key={r.id} onClick={() => pick(r)}
                  className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-slate-50 text-slate-700">{r.name}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 pt-4 space-y-3 overflow-y-auto">
              <p className="text-sm text-slate-500">Choose which record to keep. The other is merged into it and then deleted — this can't be undone.</p>
              <div className="flex gap-2">
                <Head side="this" name={title} />
                <Head side="other" name={picked.name} />
              </div>

              {otherValues === null ? (
                <div className="py-8 text-center"><Loader2 className="h-4 w-4 animate-spin text-slate-400 mx-auto" /></div>
              ) : (() => {
                const shownFields = fields.filter((f) => !(fmt(f, values[f.key], userMap) === "—" && fmt(f, otherValues[f.key], userMap) === "—"))
                // The value that will survive for a field: the chosen side, or if
                // that's blank, the other side (blank-fill).
                const resolved = (f: RecordFieldDef) => {
                  const eff = choices[f.key] ?? primary
                  const chosen = fmt(f, rawFor(eff, f.key), userMap)
                  return chosen === "—" ? fmt(f, rawFor(eff === "this" ? "other" : "this", f.key), userMap) : chosen
                }
                const Cell = ({ f, side }: { f: RecordFieldDef; side: "this" | "other" }) => {
                  const eff = choices[f.key] ?? primary
                  const active = eff === side
                  const text = fmt(f, rawFor(side, f.key), userMap)
                  const diff = fmt(f, values[f.key], userMap) !== fmt(f, otherValues[f.key], userMap)
                  return (
                    <button onClick={() => setChoices((c) => ({ ...c, [f.key]: side }))}
                      className={cn("flex items-start gap-1.5 text-left rounded-md px-1.5 py-1 min-w-0 transition-colors",
                        active ? "bg-zinc-50" : "hover:bg-slate-50")}>
                      <span className={cn("mt-0.5 h-3 w-3 rounded-full border flex items-center justify-center shrink-0", active ? "border-blue-600" : "border-slate-300")}>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                      </span>
                      <span className={cn("block break-words text-sm", active ? "text-slate-900" : "text-slate-400", diff && active && "font-medium")}>{text}</span>
                    </button>
                  )
                }
                return (
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
                    {/* Both records — click a value to keep it */}
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {shownFields.map((f) => (
                        <div key={f.key} className="px-3 py-2">
                          <span className="block text-[11px] text-slate-400 uppercase tracking-wide mb-0.5">{f.label}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <Cell f={f} side="this" />
                            <Cell f={f} side="other" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Live preview of the resulting record */}
                    <div className="lg:sticky lg:top-0 self-start">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Merged result</p>
                      <div className="border border-blue-600/10 bg-zinc-50 rounded-xl p-3 space-y-2.5">
                        <p className="text-sm font-semibold text-slate-900 break-words">{primary === "this" ? title : picked.name}</p>
                        {shownFields.map((f) => {
                          const val = resolved(f)
                          if (val === "—") return null
                          return (
                            <div key={f.key}>
                              <span className="block text-[11px] text-slate-400 uppercase tracking-wide">{f.label}</span>
                              <span className="block text-sm text-slate-900 break-words">{val}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="flex justify-between gap-2 px-5 py-4 border-t border-slate-200">
              <button onClick={() => { setPicked(null); setOtherValues(null) }} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-900">Back</button>
              <button onClick={doMerge} disabled={isPending}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />} Merge records
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AllPropertiesPanel({ title, catalog, values, userMap, onClose }: {
  title: string; catalog: RecordFieldDef[]; values: Record<string, any>; userMap: Record<string, string>; onClose: () => void
}) {
  const [q, setQ] = useState("")
  const [hideBlank, setHideBlank] = useState(false)

  const rows = catalog
    .filter((f) => f.label.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((f) => !hideBlank || !(values[f.key] === null || values[f.key] === undefined || values[f.key] === "" || values[f.key] === "—"))

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900 truncate">{title} — All Properties</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search property"
              className="w-full h-8 pl-8 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
            <input type="checkbox" checked={hideBlank} onChange={(e) => setHideBlank(e.target.checked)} className="rounded border-slate-300" />
            Hide blank
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{rows.length} properties</p>
          <div className="space-y-3">
            {rows.map((f) => (
              <div key={f.key}>
                <span className="block text-xs text-slate-500">{f.label}</span>
                <span className="block text-sm text-slate-900 break-words">{fmt(f, values[f.key], userMap)}</span>
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm text-slate-400">No matching properties.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
