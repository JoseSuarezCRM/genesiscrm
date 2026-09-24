"use client"

import { useState, useTransition, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Trash2, RefreshCw, Loader2, Users2 } from "lucide-react"
import { deleteSegment, refreshSegmentSizes } from "@/app/actions/segments"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import ExportDialog from "@/components/ui/export-dialog"
import { cn } from "@/lib/utils"

interface SegmentListRow {
  id: string
  name: string
  description: string | null
  objectType: string
  objectLabel: string
  kind: "ACTIVE" | "STATIC"
  source: "FILTER" | "IMPORT" | "MANUAL"
  size: number | null
  sizeAt: string | Date | null
  sizeExact: boolean
  creatorName: string
  summary: string
  updatedAt: string | Date
}

interface Props {
  segments: SegmentListRow[]
  canEdit: boolean
  shareUsers: { id: string; label: string }[]
  shareTeams: { id: string; label: string }[]
}

/** 15 minutes — matches SIZE_TTL_MS in lib/segments. */
const STALE_MS = 15 * 60 * 1000

function relative(d: string | Date | null | undefined): string {
  if (!d) return "never"
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

export default function SegmentsClient({ segments, canEdit }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [exportOpen, setExportOpen] = useState(false)
  // Sizes refreshed after paint, keyed by id — the server's cached value is what
  // renders first so the page isn't held up by a count per row.
  const [fresh, setFresh] = useState<Record<string, { total: number; exact: boolean }>>({})
  const [refreshing, setRefreshing] = useState(false)

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return segments
    return segments.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.objectLabel.toLowerCase().includes(q) ||
      (s.summary ?? "").toLowerCase().includes(q))
  }, [segments, search])

  // An ACTIVE segment's size is a cache. Recomputing every row while rendering
  // would mean one filtered COUNT per segment before anything appears, so the
  // stale ones are refreshed once the list is on screen instead.
  useEffect(() => {
    const stale = segments
      .filter((s) => s.kind === "ACTIVE")
      .filter((s) => !s.sizeAt || Date.now() - new Date(s.sizeAt).getTime() > STALE_MS)
      .map((s) => s.id)
    if (!stale.length) return
    let cancelled = false
    setRefreshing(true)
    refreshSegmentSizes(stale)
      .then((r) => { if (!cancelled && r && "sizes" in r && r.sizes) setFresh(r.sizes) })
      .finally(() => { if (!cancelled) setRefreshing(false) })
    return () => { cancelled = true }
  }, [segments])

  const sizeOf = (s: SegmentListRow) => fresh[s.id] ?? (s.size !== null ? { total: s.size, exact: s.sizeExact } : null)

  async function remove(s: SegmentListRow) {
    const ok = await confirmDialog({
      title: `Delete "${s.name}"?`,
      description: "The segment is removed. The records it selects are not affected.",
      confirmLabel: "Delete segment",
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const r = await deleteSegment(s.id)
      if (!("error" in r)) router.refresh()
    })
  }

  const exportData = () => ({
    headers: ["Name", "Size", "Type", "Object", "Last updated", "Creator", "Filter"],
    rows: rows.map((s) => [
      s.name,
      sizeOf(s)?.total ?? "",
      s.kind === "ACTIVE" ? "Active" : "Static",
      s.objectLabel,
      new Date(s.updatedAt).toISOString().slice(0, 10),
      s.creatorName,
      s.summary,
    ]),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search segments…"
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        {refreshing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> updating sizes
          </span>
        )}
        <button
          onClick={() => setExportOpen(true)}
          disabled={!rows.length}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
        >
          Export
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <Users2 className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-3 text-sm font-medium text-zinc-900">
            {segments.length === 0 ? "No segments yet" : "No segments match that search"}
          </p>
          {segments.length === 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              A segment is a named list of records — build one from a filter, or from an import.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/60 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5 text-right">Size</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Object</th>
                <th className="px-4 py-2.5">Last updated</th>
                <th className="px-4 py-2.5">Creator</th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((s) => {
                const size = sizeOf(s)
                const stale = s.kind === "ACTIVE" && !fresh[s.id] && (!s.sizeAt || Date.now() - new Date(s.sizeAt).getTime() > STALE_MS)
                return (
                  <tr key={s.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/segments/${s.id}`} className="font-medium text-zinc-900 hover:underline">
                        {s.name}
                      </Link>
                      {s.summary && <div className="mt-0.5 truncate text-xs text-zinc-500" title={s.summary}>{s.summary}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {size === null ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        <span
                          className={cn(stale && "text-zinc-400")}
                          // The number is a cache for ACTIVE segments; "≥" means a
                          // scan was capped, so it's a floor rather than a total.
                          title={s.kind === "ACTIVE" ? `as of ${relative(fresh[s.id] ? new Date() : s.sizeAt)}` : "exact"}
                        >
                          {size.exact ? "" : "≥ "}{size.total.toLocaleString()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        s.kind === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                      )}>
                        {s.kind === "ACTIVE" ? "Active" : "Static"}
                      </span>
                      {s.source === "IMPORT" && (
                        <span className="ml-1.5 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Import</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{s.objectLabel}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{relative(s.updatedAt)}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{s.creatorName}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <button
                          onClick={() => remove(s)}
                          disabled={isPending}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="Delete segment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        subject="segments"
        defaultName="segments"
        getData={exportData}
      />
    </div>
  )
}
