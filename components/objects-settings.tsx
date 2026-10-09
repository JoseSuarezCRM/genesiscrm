"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Loader2, Pencil, Trash2, ExternalLink, ListChecks, GitBranch, Search } from "lucide-react"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { createCustomObject, updateCustomObject, deleteCustomObject } from "@/app/actions/custom-objects"

export interface ObjectRow {
  /** Registry key: "REFERRAL", "PROVIDER", … or "CO:<key>". */
  key: string
  label: string
  kind: "builtin" | "custom"
  id?: string
  singular?: string
  plural?: string
  /** A built-in feature depends on it (e.g. Referral Calls): rename only, no delete. */
  locked?: boolean
  propertyCount: number
  recordCount: number | null
  /** Null where the object can't have pipelines. */
  pipelineCount: number | null
  listHref: string
}

const inputCls = "h-9 w-full px-3 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function ObjectsSettings({ objects, canProperties, canPipelines, initialEditKey }: {
  objects: ObjectRow[]
  canProperties: boolean
  canPipelines: boolean
  initialEditKey?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ObjectRow | null>(() => objects.find((o) => o.key === initialEditKey && o.kind === "custom") ?? null)
  const [singular, setSingular] = useState("")
  const [plural, setPlural] = useState("")
  const [err, setErr] = useState("")

  const q = query.trim().toLowerCase()
  const rows = q ? objects.filter((o) => o.label.toLowerCase().includes(q)) : objects

  function openCreate() { setErr(""); setSingular(""); setPlural(""); setCreating(true) }
  function openEdit(o: ObjectRow) { setErr(""); setSingular(o.singular ?? ""); setPlural(o.plural ?? ""); setEditing(o) }

  function create() {
    setErr("")
    if (!singular.trim() || !plural.trim()) { setErr("Both names are required."); return }
    startTransition(async () => {
      const res: any = await createCustomObject({ singular, plural })
      if (res?.error) { setErr(res.error); return }
      setCreating(false)
      router.refresh()
    })
  }

  function saveEdit() {
    if (!editing?.id) return
    setErr("")
    if (!singular.trim() || !plural.trim()) { setErr("Both names are required."); return }
    startTransition(async () => {
      const res: any = await updateCustomObject(editing.id!, { singular, plural })
      if (res?.error) { setErr(res.error); return }
      setEditing(null)
      router.refresh()
    })
  }

  async function remove() {
    if (!editing?.id) return
    if (!(await confirmDialog(`Delete "${editing.label}" and all its records? This cannot be undone.`))) return
    startTransition(async () => {
      const res: any = await deleteCustomObject(editing.id!)
      if (res?.error) { setErr(res.error); return }
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objects…"
            className="h-9 w-full rounded-lg border border-zinc-200 pl-9 pr-3 text-sm focus:border-zinc-400 focus:outline-none" />
        </div>
        <button onClick={openCreate}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Create object
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-2.5">Object</th>
              <th className="px-4 py-2.5 text-right">Properties</th>
              <th className="px-4 py-2.5 text-right">Records</th>
              <th className="px-4 py-2.5 text-right">Pipelines</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">No objects match “{query}”.</td></tr>
            )}
            {rows.map((o) => (
              <tr key={o.key} className="group hover:bg-zinc-50/60">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {o.kind === "custom" ? (
                      <button onClick={() => openEdit(o)} className="font-medium text-zinc-900 hover:underline">{o.label}</button>
                    ) : (
                      <span className="font-medium text-zinc-900">{o.label}</span>
                    )}
                    {o.locked && (
                      <span title="Used by a built-in feature: it can be renamed, but not deleted."
                        className="text-[10px] font-medium uppercase text-zinc-500">Locked</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{o.propertyCount}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{o.recordCount?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">{o.pipelineCount ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {canProperties && (
                      <Link href={`/settings/properties?object=${encodeURIComponent(o.key)}`} title="Properties"
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                        <ListChecks className="h-3.5 w-3.5" /> Properties
                      </Link>
                    )}
                    {canPipelines && o.pipelineCount !== null && (
                      <Link href={`/settings/objects/pipelines?object=${encodeURIComponent(o.key)}`} title="Pipelines"
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                        <GitBranch className="h-3.5 w-3.5" /> Pipelines
                      </Link>
                    )}
                    {o.kind === "custom" && (
                      <button onClick={() => openEdit(o)} title="Rename or delete"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Link href={o.listHref} title={`Open ${o.label}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create a custom object */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create object</DialogTitle></DialogHeader>
          <NameFields singular={singular} plural={plural} setSingular={setSingular} setPlural={setPlural} onEnter={create} />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <DialogFooter>
            <button onClick={() => setCreating(false)} className="h-9 px-3 text-sm text-zinc-600 hover:text-zinc-800">Cancel</button>
            <button onClick={create} disabled={isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create object
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename / delete a custom object */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.label}</DialogTitle></DialogHeader>
          <NameFields singular={singular} plural={plural} setSingular={setSingular} setPlural={setPlural} onEnter={saveEdit} />
          {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
          <DialogFooter className="sm:justify-between">
            {editing && !editing.locked ? (
              <button onClick={remove} disabled={isPending} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5" /> Delete object
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="h-9 px-3 text-sm text-zinc-600 hover:text-zinc-800">Cancel</button>
              <button onClick={saveEdit} disabled={isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NameFields({ singular, plural, setSingular, setPlural, onEnter }: {
  singular: string; plural: string; setSingular: (v: string) => void; setPlural: (v: string) => void; onEnter: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Singular name</label>
        <input className={inputCls} value={singular} onChange={(e) => setSingular(e.target.value)} placeholder="Visit" autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") onEnter() }} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Plural name</label>
        <input className={inputCls} value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="Visits"
          onKeyDown={(e) => { if (e.key === "Enter") onEnter() }} />
      </div>
    </div>
  )
}
