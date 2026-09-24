"use client"

import { useState, useEffect, useMemo, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, AlertTriangle, Database, Upload, Check } from "lucide-react"
import { FilterEditor } from "@/components/ui/filter-builder"
import { ViewAccessSelector } from "@/components/view-access-selector"
import { emptyFilter, activeConditionCount, type FilterState } from "@/lib/filters"
import { toFilterFields, describeFilter, type ObjectFieldDef } from "@/lib/object-fields"
import { previewSegment, createSegment } from "@/app/actions/segments"
import { cn } from "@/lib/utils"

interface ImportRunRow {
  id: string
  objectKey: string
  objectType: string
  created: number
  updated: number
  changeRows: number
  createdAt: string | Date
}

interface Props {
  objects: { key: string; label: string }[]
  objectType: string | null
  objectLabel: string
  filterDefs: ObjectFieldDef[]
  shareUsers: { id: string; label: string }[]
  shareTeams: { id: string; label: string }[]
  importRuns: ImportRunRow[]
  initialImportRun: string | null
}

type Access = { visibility: "PRIVATE" | "EVERYONE" | "TEAM" | "CUSTOM"; teamId?: string | null; sharedUserIds?: string[] }

export default function SegmentBuilder({
  objects, objectType, objectLabel, filterDefs, shareUsers, shareTeams, importRuns, initialImportRun,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [filter, setFilter] = useState<FilterState>(emptyFilter())
  const [importRunIds, setImportRunIds] = useState<string[]>(initialImportRun ? [initialImportRun] : [])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [kind, setKind] = useState<"ACTIVE" | "STATIC">("ACTIVE")
  const [access, setAccess] = useState<Access>({ visibility: "PRIVATE" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = useMemo(() => toFilterFields(filterDefs), [filterDefs])
  const fromImport = importRunIds.length > 0

  // ── Live preview ───────────────────────────────────────────────────────────
  // Debounced and abortable: the filter changes on every keystroke, and each
  // preview is a real count plus 25 rows against the live table.
  const [preview, setPreview] = useState<{ total: number; exact: boolean; rows: { id: string; label: string }[]; warnings: any[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!objectType || fromImport) return
    const mine = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await previewSegment(objectType, filter, 25)
        // Ignore a response that a newer keystroke has already superseded.
        if (seq.current === mine) setPreview(r as any)
      } catch {
        if (seq.current === mine) setPreview(null)
      } finally {
        if (seq.current === mine) setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [objectType, filter, fromImport])

  const conditionCount = activeConditionCount(filter, fields)
  const prose = describeFilter(filter, filterDefs)

  async function save() {
    setError(null)
    if (!name.trim()) { setError("Give the segment a name."); return }
    if (!objectType) return
    setSaving(true)
    const r = await createSegment({
      name, description, objectType, kind,
      source: fromImport ? "IMPORT" : "FILTER",
      filter: fromImport ? null : filter,
      sourceConfig: fromImport ? { importRunIds } : null,
      access,
    })
    setSaving(false)
    if ("error" in r && r.error) { setError(r.error); return }
    startTransition(() => router.push(`/segments/${(r as any).id}`))
  }

  // ── Step 1: pick an object ─────────────────────────────────────────────────
  if (!objectType) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <button onClick={() => router.push("/segments")} className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
            <ArrowLeft className="h-4 w-4" /> Segments
          </button>
          <h1 className="text-2xl font-bold text-zinc-900">What are you segmenting?</h1>
          <p className="text-sm text-zinc-500">A segment holds records of a single object.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {objects.map((o) => (
            <button
              key={o.key}
              onClick={() => router.push(`/segments/new?object=${encodeURIComponent(o.key)}`)}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-medium text-zinc-900 shadow-sm hover:border-zinc-400 hover:bg-zinc-50"
            >
              <Database className="h-4 w-4 shrink-0 text-zinc-400" />
              {o.label}
            </button>
          ))}
        </div>

        {importRuns.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <Upload className="h-4 w-4 text-zinc-400" /> …or from an import
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Every record an import created or updated. Undone imports aren&apos;t listed.
            </p>
            <div className="mt-3 divide-y divide-zinc-100">
              {importRuns.slice(0, 8).map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/segments/new?object=${encodeURIComponent(r.objectType)}&importRun=${r.id}`)}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="text-zinc-900">{r.objectKey}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {r.changeRows.toLocaleString()} record{r.changeRows !== 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Step 2: define + review ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <button onClick={() => router.push("/segments/new")} className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> Change object
        </button>
        <h1 className="text-2xl font-bold text-zinc-900">New {objectLabel} segment</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {fromImport ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <Upload className="h-4 w-4 text-zinc-400" /> From an import
              </div>
              <p className="mt-1.5 text-sm text-zinc-600">
                {importRunIds.length} import{importRunIds.length !== 1 ? "s" : ""} selected — every record they created or updated.
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Records deleted since the import are left out, so this can be smaller than the import reported.
              </p>
              <button onClick={() => setImportRunIds([])} className="mt-3 text-xs font-medium text-zinc-600 underline hover:text-zinc-900">
                Use a filter instead
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium text-zinc-900">Which records?</div>
              <FilterEditor fields={fields} value={filter} onChange={setFilter} />
              {conditionCount === 0 && (
                <p className="mt-3 text-xs text-zinc-500">No conditions yet — the segment would hold every record.</p>
              )}
            </div>
          )}

          {/* Anything the database can't evaluate is said out loud rather than
              dropped, so a size is never quietly wrong. */}
          {!!preview?.warnings?.length && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {preview.warnings.length} condition{preview.warnings.length !== 1 ? "s" : ""} can&apos;t be applied in the database
                </p>
                <p className="mt-0.5">
                  {preview.warnings.map((w: any) => w.label).join(", ")} — evaluated over the records loaded, so a very large
                  result may be capped.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
              <span className="text-sm font-medium text-zinc-900">Preview</span>
              <span className="inline-flex items-center gap-1.5 text-sm text-zinc-500">
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {fromImport
                  ? "Saved on create"
                  : preview
                    ? `${preview.exact ? "" : "≥ "}${preview.total.toLocaleString()} record${preview.total !== 1 ? "s" : ""}`
                    : "—"}
              </span>
            </div>
            <div className="max-h-72 overflow-auto">
              {fromImport ? (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  Import segments are resolved when you save.
                </p>
              ) : preview?.rows?.length ? (
                <ul className="divide-y divide-zinc-100 text-sm">
                  {preview.rows.map((r) => (
                    <li key={r.id} className="px-4 py-2 text-zinc-700">{r.label}</li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-sm text-zinc-500">
                  {loading ? "Counting…" : "No records match."}
                </p>
              )}
            </div>
            {!fromImport && preview && preview.total > preview.rows.length && (
              <div className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
                Showing the first {preview.rows.length} of {preview.total.toLocaleString()}.
              </div>
            )}
          </div>
        </div>

        {/* Review and save */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. ${objectLabel} to follow up`}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Description <span className="text-zinc-400">(optional)</span></label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Processing</label>
              <div className="space-y-2">
                {([
                  ["ACTIVE", "Active", "Re-checked every time it's used, so it always reflects the data now. Records join and leave on their own."],
                  ["STATIC", "Static", "Frozen when you save. The same records stay in it even if they change later."],
                ] as const).map(([value, label, help]) => (
                  <button
                    key={value}
                    onClick={() => setKind(value)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left",
                      kind === value ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <span className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      kind === value ? "border-zinc-900 bg-zinc-900" : "border-zinc-300",
                    )}>
                      {kind === value && <Check className="h-2.5 w-2.5 text-white" />}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-zinc-900">{label}</span>
                      <span className="block text-xs text-zinc-500">{help}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Who can see it</label>
              <ViewAccessSelector
                value={access as any}
                onChange={(v: any) => setAccess(v)}
                users={shareUsers as any}
                teams={shareTeams as any}
              />
            </div>

            {!fromImport && conditionCount > 0 && (
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{prose}</p>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={save}
              disabled={saving || isPending || !name.trim()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {(saving || isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              Create segment
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
