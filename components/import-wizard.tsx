"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Undo2, History } from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { normalizeKey } from "@/lib/import-parse"
import { runImportBatch, startImportRun, listImportRuns, undoImportRun, createImportProperty, type ImportRunDTO } from "@/app/actions/import-records"
import { RECORD_ID_TARGET, type ImportMode } from "@/lib/import-types"

export interface ImportProperty { id: string; name: string; type: string; options?: string[]; optionLabels?: Record<string, string> }
export interface ImportObject { key: string; singular: string; plural: string; properties: ImportProperty[] }
export interface AssocTarget { key: string; label: string }

// Column-target sentinels. Real property ids and "assoc:<type>" are the others.
const IGNORE = "__ignore"
const CREATE = "__create"
const ASSOC_PREFIX = "assoc:"
const BATCH = 100
const NEW_PROP_TYPES: { value: string; label: string }[] = [
  { value: "TEXT", label: "Text" }, { value: "LONG_TEXT", label: "Long text" }, { value: "NUMBER", label: "Number" },
  { value: "EMAIL", label: "Email" }, { value: "PHONE", label: "Phone" }, { value: "DATE", label: "Date" },
  { value: "DATE_TIME", label: "Date & time" }, { value: "CHECKBOX", label: "Checkbox" },
  { value: "DROPDOWN", label: "Dropdown" }, { value: "MULTI_SELECT", label: "Multi-select" }, { value: "URL", label: "URL" },
]

type Parsed = { headers: string[]; rows: Record<string, string>[]; total: number }
type Progress = { created: number; updated: number; skipped: number; errors: { row: number; message: string }[]; done: number }

export default function ImportWizard({ objects, assocTargets }: { objects: ImportObject[]; assocTargets: AssocTarget[] }) {
  const router = useRouter()
  const [objectKey, setObjectKey] = useState(objects[0]?.key ?? "")
  const [fileName, setFileName] = useState("")
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [map, setMap] = useState<Record<string, string>>({}) // header -> IGNORE | RECORD_ID_TARGET | propId | assoc:<type>
  const [mode, setMode] = useState<ImportMode>("upsert")
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [done, setDone] = useState(false)
  const [runs, setRuns] = useState<ImportRunDTO[]>([])
  const [undoingId, setUndoingId] = useState<string | null>(null)
  // Properties created on the fly from the mapper (added to this object's list).
  const [createdProps, setCreatedProps] = useState<ImportProperty[]>([])
  const [newPropCol, setNewPropCol] = useState<string | null>(null)
  const [newPropName, setNewPropName] = useState("")
  const [newPropType, setNewPropType] = useState("TEXT")
  const [creatingProp, setCreatingProp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const baseObject = objects.find((o) => o.key === objectKey)!
  const object = { ...baseObject, properties: [...baseObject.properties, ...createdProps] }

  // Load the recent imports for the selected object (for the undo history).
  const refreshRuns = (key = objectKey) => { if (key) listImportRuns(key).then(setRuns).catch(() => {}) }
  useEffect(() => { refreshRuns(objectKey); setCreatedProps([]) }, [objectKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Distinct values in a column, for seeding a new dropdown/multi-select's options.
  function distinctOptions(col: string, type: string): string[] {
    if (!parsed || (type !== "DROPDOWN" && type !== "MULTI_SELECT")) return []
    const set = new Set<string>()
    for (const row of parsed.rows) {
      const raw = (row[col] ?? "").trim()
      if (!raw) continue
      if (type === "MULTI_SELECT") raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean).forEach((v) => set.add(v))
      else set.add(raw)
    }
    return Array.from(set)
  }

  async function createProp() {
    const name = newPropName.trim()
    if (!name || !newPropCol) return
    setCreatingProp(true); setError(null)
    try {
      const res = await createImportProperty(objectKey, name, newPropType, distinctOptions(newPropCol, newPropType))
      if (res.error || !res.property) { setError(res.error ?? "Couldn't create the property."); return }
      const p = res.property
      setCreatedProps((prev) => [...prev, p])
      setMap((m) => ({ ...m, [newPropCol]: p.id }))
      setNewPropCol(null); setNewPropName("")
    } finally { setCreatingProp(false) }
  }

  async function undo(id: string) {
    setUndoingId(id)
    try {
      const r = await undoImportRun(id)
      if (r.error) setError(r.error)
      refreshRuns(); router.refresh()
    } finally { setUndoingId(null) }
  }

  // Auto-suggest a mapping by matching each header to a property name / Record ID.
  function suggestMap(headers: string[], obj: ImportObject): Record<string, string> {
    const m: Record<string, string> = {}
    for (const h of headers) {
      const nk = normalizeKey(h)
      if (nk === "recordid" || nk === "id") { m[h] = RECORD_ID_TARGET; continue }
      const prop = obj.properties.find((p) => normalizeKey(p.name) === nk || p.id === h)
      m[h] = prop ? prop.id : IGNORE
    }
    return m
  }

  async function onFile(file: File) {
    setError(null); setParsing(true); setParsed(null); setDone(false); setProgress(null)
    setFileName(file.name)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/import/parse", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't read the file.")
      setParsed(data)
      setMap(suggestMap(data.headers, object))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the file.")
    } finally {
      setParsing(false)
    }
  }

  const hasRecordId = useMemo(() => Object.values(map).includes(RECORD_ID_TARGET), [map])
  const mappedFieldCount = useMemo(
    () => Object.values(map).filter((t) => t !== IGNORE && t !== RECORD_ID_TARGET && !t.startsWith(ASSOC_PREFIX)).length,
    [map],
  )

  function buildConfig() {
    const fieldMap: Record<string, string> = {}
    const assocMap: { column: string; targetType: string }[] = []
    for (const [col, target] of Object.entries(map)) {
      if (target === IGNORE) continue
      if (target.startsWith(ASSOC_PREFIX)) assocMap.push({ column: col, targetType: target.slice(ASSOC_PREFIX.length) })
      else fieldMap[col] = target // propId or RECORD_ID_TARGET
    }
    return { fieldMap, assocMap, mode }
  }

  async function run() {
    if (!parsed) return
    setRunning(true); setError(null); setDone(false)
    const config = buildConfig()
    const acc: Progress = { created: 0, updated: 0, skipped: 0, errors: [], done: 0 }
    setProgress({ ...acc })
    try {
      // A tracked run so this import can be undone later.
      const started = await startImportRun(objectKey)
      if (started.error || !started.runId) { setError(started.error ?? "Couldn't start the import."); return }
      const runId = started.runId
      for (let i = 0; i < parsed.rows.length; i += BATCH) {
        const slice = parsed.rows.slice(i, i + BATCH)
        const r = await runImportBatch(objectKey, config, slice, i, runId)
        if (r.error) { setError(r.error); break }
        acc.created += r.created; acc.updated += r.updated; acc.skipped += r.skipped
        acc.errors.push(...r.errors); acc.done += slice.length
        setProgress({ ...acc, errors: acc.errors.slice(0, 200) })
      }
      setDone(true)
      refreshRuns(); router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed. Click Import to resume the remaining rows.")
    } finally {
      setRunning(false)
    }
  }

  const pct = progress && parsed ? Math.round((progress.done / parsed.rows.length) * 100) : 0
  const card = "rounded-xl border border-zinc-200 bg-white p-4"
  const stepLabel = "text-xs font-semibold uppercase tracking-wide text-slate-400"

  return (
    <div className="space-y-4">
      {/* Step 1 — object + file */}
      <div className={card}>
        <p className={stepLabel}>1 · Object &amp; file</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">Import into
            <StyledSelect value={objectKey} onChange={(e) => { setObjectKey(e.target.value); if (parsed) setMap(suggestMap(parsed.headers, objects.find(o => o.key === e.target.value)!)) }} className="mt-1 min-w-[200px] h-9 border border-slate-200 rounded-lg bg-white">
              {objects.map((o) => <option key={o.key} value={o.key}>{o.plural}</option>)}
            </StyledSelect>
          </label>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing} className="mt-5">
            {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />} Choose file
          </Button>
          {fileName && <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-slate-500"><FileSpreadsheet className="h-4 w-4" /> {fileName}{parsed ? ` · ${parsed.rows.length} rows` : ""}</span>}
        </div>
        {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {/* Step 2 — mapping */}
      {parsed && (
        <div className={card}>
          <p className={stepLabel}>2 · Map columns</p>
          <p className="mt-1 text-xs text-slate-400">Each column defaults to <span className="font-medium">Don&apos;t import</span>. Map one column to <span className="font-medium">Record ID</span> to update existing records.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-1.5 pr-4 font-medium">File column</th>
                  <th className="py-1.5 pr-4 font-medium">Sample</th>
                  <th className="py-1.5 font-medium">Import as</th>
                </tr>
              </thead>
              <tbody>
                {parsed.headers.map((h) => (
                  <tr key={h} className="border-t border-zinc-100">
                    <td className="py-1.5 pr-4 font-medium text-slate-700 whitespace-nowrap">{h}</td>
                    <td className="py-1.5 pr-4 text-slate-400 max-w-[220px] truncate">{parsed.rows[0]?.[h] || "—"}</td>
                    <td className="py-1.5">
                      <StyledSelect value={map[h] ?? IGNORE}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === CREATE) { setNewPropCol(h); setNewPropName(h); setNewPropType("TEXT") }
                          else setMap((m) => ({ ...m, [h]: v }))
                        }}
                        className="min-w-[220px] h-8 px-2 text-sm border border-slate-200 rounded-md bg-white">
                        <option value={IGNORE}>Don&apos;t import</option>
                        <option value={RECORD_ID_TARGET}>Record ID (match key)</option>
                        {object.properties.map((p) => <option key={p.id} value={p.id}>Field: {p.name}</option>)}
                        <option value={CREATE}>＋ Create new property…</option>
                        {assocTargets.map((t) => <option key={t.key} value={ASSOC_PREFIX + t.key}>Associate → {t.label}</option>)}
                      </StyledSelect>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Tip: to link a record to another object, set that column to <span className="font-medium">Associate → …</span> — it should hold the related record&apos;s <span className="font-medium">id or Record ID</span>.
          </p>
        </div>
      )}

      {/* Step 3 — mode + run */}
      {parsed && (
        <div className={card}>
          <p className={stepLabel}>3 · Import</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-600">When a Record ID matches
              <StyledSelect value={mode} onChange={(e) => setMode(e.target.value as ImportMode)} className="mt-1 min-w-[200px] h-9 border border-slate-200 rounded-lg bg-white">
                <option value="upsert">Create new &amp; update existing</option>
                <option value="createOnly">Only create new (ignore matches)</option>
                <option value="updateOnly">Only update existing (skip new)</option>
              </StyledSelect>
            </label>
            <Button onClick={run} disabled={running} className="mt-5">
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Import {parsed.rows.length} rows
            </Button>
          </div>
          {!hasRecordId && mode !== "createOnly" && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> No Record ID column mapped — every row will create a new record.</p>
          )}
          {mappedFieldCount === 0 && (
            <p className="mt-2 text-xs text-slate-400">Map at least one column to a field to import values.</p>
          )}

          {progress && (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                <div className="h-full bg-zinc-900 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                {done ? <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Done</span>
                  : <span className="text-slate-500">{progress.done} / {parsed.rows.length}…</span>}
                <span className="text-slate-600"><span className="font-semibold">{progress.created}</span> created</span>
                <span className="text-slate-600"><span className="font-semibold">{progress.updated}</span> updated</span>
                {progress.skipped > 0 && <span className="text-slate-500">{progress.skipped} skipped</span>}
                {progress.errors.length > 0 && <span className="text-red-600">{progress.errors.length} issue{progress.errors.length === 1 ? "" : "s"}</span>}
              </div>
              {progress.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-2 text-xs text-red-700 space-y-0.5">
                  {progress.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent imports — undo (delete created, restore updated, remove links) */}
      {runs.length > 0 && (
        <div className={card}>
          <p className={stepLabel + " flex items-center gap-1.5"}><History className="h-3.5 w-3.5" /> Recent imports</p>
          <div className="mt-3 divide-y divide-zinc-100">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="text-slate-500 w-40 shrink-0">{new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span className="text-slate-600"><span className="font-semibold">{r.created}</span> created · <span className="font-semibold">{r.updated}</span> updated</span>
                {r.createdByName && <span className="text-slate-400">by {r.createdByName}</span>}
                <div className="ml-auto">
                  {r.status === "undone" ? (
                    <span className="text-xs text-slate-400">Undone</span>
                  ) : (
                    <button onClick={() => undo(r.id)} disabled={undoingId === r.id}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      {undoingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Undo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Undo deletes the records this import created, restores prior values on the ones it updated, and removes the links it added.</p>
        </div>
      )}

      {/* Create a new property on the object, then map this column to it */}
      <Dialog open={newPropCol !== null} onOpenChange={(o) => { if (!o) setNewPropCol(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New property on {object.plural}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Property name</label>
              <input value={newPropName} onChange={(e) => setNewPropName(e.target.value)} autoFocus placeholder="e.g. Settlement Balance"
                onKeyDown={(e) => { if (e.key === "Enter") createProp() }}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Field type</label>
              <StyledSelect value={newPropType} onChange={(e) => setNewPropType(e.target.value)} className="min-w-[200px] h-9 border border-slate-200 rounded-lg bg-white">
                {NEW_PROP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </StyledSelect>
            </div>
            <p className="text-[11px] text-slate-400">Creates the property on this object now, then maps the column to it. (For Dropdown/Multi-select, options fill in from the imported values as text — set colors/labels later in Custom Objects.)</p>
          </div>
          <DialogFooter>
            <button onClick={() => setNewPropCol(null)} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button onClick={createProp} disabled={creatingProp || !newPropName.trim()}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {creatingProp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Create &amp; map
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
