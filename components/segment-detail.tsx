"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RefreshCw, Loader2, AlertTriangle, Trash2 } from "lucide-react"
import { refreshSegmentSize, rebuildSegment, removeFromSegment, deleteSegment } from "@/app/actions/segments"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import ExportDialog from "@/components/ui/export-dialog"
import { recordHref } from "@/lib/record-href"
import { cn } from "@/lib/utils"

interface Members {
  total: number
  exact: boolean
  warnings: { label: string; operator: string; reason: string }[]
  rows: { id: string; label: string }[]
  page: number
  pageSize: number
}

interface Props {
  segment: {
    id: string
    name: string
    description: string | null
    objectType: string
    kind: "ACTIVE" | "STATIC"
    source: "FILTER" | "IMPORT" | "MANUAL"
    lastBuiltAt: string | null
    createdAt: string
    updatedAt: string
  }
  objectLabel: string
  summary: string
  members: Members
  canEdit: boolean
}

export default function SegmentDetail({ segment, objectLabel, summary, members, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const isStatic = segment.kind === "STATIC"
  const pages = Math.max(1, Math.ceil(members.total / members.pageSize))

  async function refresh() {
    setBusy(true)
    await (isStatic ? rebuildSegment(segment.id) : refreshSegmentSize(segment.id))
    setBusy(false)
    startTransition(() => router.refresh())
  }

  async function removeSelected() {
    const ok = await confirmDialog({
      title: `Remove ${selected.length} record${selected.length !== 1 ? "s" : ""}?`,
      description: "They leave this segment. The records themselves are not affected.",
      confirmLabel: "Remove",
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    await removeFromSegment(segment.id, selected)
    setSelected([])
    setBusy(false)
    startTransition(() => router.refresh())
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Delete "${segment.name}"?`,
      description: "The segment is removed. The records it selects are not affected.",
      confirmLabel: "Delete segment",
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    const r = await deleteSegment(segment.id)
    if (!("error" in r)) router.push("/segments")
    else setBusy(false)
  }

  const stats: [string, string][] = [
    ["Size", `${members.exact ? "" : "≥ "}${members.total.toLocaleString()}`],
    ["Type", isStatic ? "Static" : "Active"],
    ["Object", objectLabel],
    [isStatic ? "Last built" : "Last updated",
      new Date(isStatic ? segment.lastBuiltAt ?? segment.updatedAt : segment.updatedAt)
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })],
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{segment.name}</h1>
          {segment.description && <p className="mt-0.5 text-sm text-zinc-600">{segment.description}</p>}
          {summary && <p className="mt-1 text-sm text-zinc-500">{summary}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={busy || isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isStatic ? "Rebuild" : "Refresh"}
          </button>
          <button
            onClick={() => setExportOpen(true)}
            disabled={!members.rows.length}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Export
          </button>
          {canEdit && (
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              title="Delete segment"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Conditions the database couldn't apply are named, not swallowed — a
          size that quietly excluded a criterion would be worse than no size. */}
      {!!members.warnings?.length && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {members.warnings.length} condition{members.warnings.length !== 1 ? "s" : ""} evaluated outside the database
            </p>
            <p className="mt-0.5">{members.warnings.map((w) => w.label).join(", ")}</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
          <span className="text-sm font-medium text-zinc-900">Records</span>
          {isStatic && canEdit && selected.length > 0 && (
            <button
              onClick={removeSelected}
              disabled={busy}
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
            >
              Remove {selected.length} from segment
            </button>
          )}
        </div>
        {members.rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500">
            {segment.source === "IMPORT"
              ? "No records — the import may have been undone, or its records deleted."
              : "No records match."}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 text-sm">
            {members.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                {isStatic && canEdit && (
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id))}
                    className="h-3.5 w-3.5 rounded border-zinc-300"
                  />
                )}
                <Link href={recordHref(segment.objectType, r.id) || "#"} className="text-zinc-700 hover:underline">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2 text-xs text-zinc-500">
            <span>Page {members.page} of {pages}</span>
            <div className="flex gap-1">
              <Link
                href={`/segments/${segment.id}?page=${Math.max(1, members.page - 1)}`}
                className={cn("rounded border border-zinc-200 px-2 py-1", members.page <= 1 && "pointer-events-none opacity-40")}
              >
                Previous
              </Link>
              <Link
                href={`/segments/${segment.id}?page=${Math.min(pages, members.page + 1)}`}
                className={cn("rounded border border-zinc-200 px-2 py-1", members.page >= pages && "pointer-events-none opacity-40")}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        subject="records"
        defaultName={segment.name.toLowerCase().replace(/\s+/g, "-")}
        getData={() => ({ headers: ["Record"], rows: members.rows.map((r) => [r.label]) })}
        count={members.total}
      />
    </div>
  )
}
