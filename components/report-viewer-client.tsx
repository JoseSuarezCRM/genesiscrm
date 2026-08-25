"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Star, Loader2, Pencil, MoreHorizontal, Copy, Tag, UserCog, LayoutDashboard, Download, Trash2, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import StyledSelect from "@/components/ui/styled-select"
import ExportDialog from "@/components/ui/export-dialog"
import { ReportView, DataTable } from "@/components/report-view"
import { runReportPreview, getReportRows } from "@/app/actions/report-builder"
import {
  togglePinSavedReport, cloneSavedReport, renameSavedReport, deleteSavedReport,
  setSavedReportTags, changeSavedReportOwner, type ReportView as ReportViewData,
} from "@/app/actions/saved-reports"
import { getDashboards, addReportToDashboard, type DashboardSummary } from "@/app/actions/dashboards"
import { DATE_PRESET_GROUPS } from "@/lib/reporting/date-presets"
import type { ReportConfig, ReportResult } from "@/lib/reporting/types"
import type { ShareUser } from "@/components/view-access-selector"

const CREATED_FIELD: Record<string, string> = { REFERRAL: "createdAt", PROVIDER: "createdAt", PRACTICE: "createdAt", LOCATION: "createdAt", ACTIVITY: "createdAt", TASK: "createdAt", SURGERY: "creationDate" }
const createdFieldFor = (p: string) => (p.startsWith("CO:") ? "createdAt" : CREATED_FIELD[p] ?? "createdAt")
const DATE_GROUPED = DATE_PRESET_GROUPS.filter((p) => p.value !== "custom").reduce((acc, p) => { (acc[p.group] ??= []).push(p); return acc }, {} as Record<string, typeof DATE_PRESET_GROUPS>)

export default function ReportViewerClient({ report, siblings, shareUsers }: {
  report: ReportViewData; siblings: { id: string; name: string }[]; shareUsers: ShareUser[]
}) {
  const router = useRouter()
  const cfg = report.config as unknown as ReportConfig
  const idx = siblings.findIndex((s) => s.id === report.id)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null

  const [pinned, setPinned] = useState(report.isPinned)
  const [datePreset, setDatePreset] = useState<string>(cfg.dateRange?.preset ?? "all")
  const [result, setResult] = useState<ReportResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataTab, setDataTab] = useState<"unsummarized" | "summarized">("summarized")
  const [dataResult, setDataResult] = useState<ReportResult | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(report.name)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tags, setTags] = useState<string[]>(report.tags)
  const [tagDraft, setTagDraft] = useState("")
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [dashOpen, setDashOpen] = useState(false)
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([])
  const [, startAct] = useTransition()

  const runCfg = useMemo<ReportConfig>(() => ({
    ...cfg,
    dateRange: datePreset === "all" ? null : { field: cfg.dateRange?.field ?? createdFieldFor(cfg.primary), preset: datePreset, from: cfg.dateRange?.from, to: cfg.dateRange?.to },
  }), [cfg, datePreset])

  useEffect(() => {
    let alive = true; setLoading(true)
    runReportPreview(runCfg).then((r) => alive && setResult(r)).catch(() => alive && setResult(null)).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [runCfg])

  useEffect(() => {
    let alive = true; setDataLoading(true)
    runReportPreview({ ...runCfg, viz: "table", tableMode: dataTab } as ReportConfig).then((r) => alive && setDataResult(r)).catch(() => alive && setDataResult(null)).finally(() => alive && setDataLoading(false))
    return () => { alive = false }
  }, [runCfg, dataTab])

  function toggleStar() { const n = !pinned; setPinned(n); togglePinSavedReport(report.id, n).catch(() => {}) }
  function doClone() { setActionsOpen(false); startAct(async () => { const { id } = await cloneSavedReport(report.id); router.push(`/reports/view/${id}`) }) }
  function saveRename() { const n = nameDraft.trim(); setRenaming(false); if (!n) return; startAct(async () => { await renameSavedReport(report.id, n); router.refresh() }) }
  function doDelete() { setActionsOpen(false); startAct(async () => { await deleteSavedReport(report.id); router.push("/reports") }) }
  function saveTags() { setTagsOpen(false); startAct(() => { setSavedReportTags(report.id, tags).catch(() => {}) }) }
  function changeOwner(userId: string) { setOwnerOpen(false); startAct(async () => { await changeSavedReportOwner(report.id, userId); router.refresh() }) }
  async function openDash() { setDashOpen(true); setActionsOpen(false); try { setDashboards(await getDashboards()) } catch { setDashboards([]) } }
  function addToDash(dashboardId: string) { startAct(async () => { await addReportToDashboard(dashboardId, report.id); setDashOpen(false) }) }

  const action = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"><ChevronLeft className="h-4 w-4" /> Reports</Link>
          {idx >= 0 && (
            <div className="flex items-center gap-1 text-sm text-zinc-500">
              {prev ? <Link href={`/reports/view/${prev.id}`} className="rounded p-1 hover:bg-zinc-100"><ChevronLeft className="h-4 w-4" /></Link> : <span className="p-1 opacity-30"><ChevronLeft className="h-4 w-4" /></span>}
              <span>{idx + 1} of {siblings.length}</span>
              {next ? <Link href={`/reports/view/${next.id}`} className="rounded p-1 hover:bg-zinc-100"><ChevronRight className="h-4 w-4" /></Link> : <span className="p-1 opacity-30"><ChevronRight className="h-4 w-4" /></span>}
            </div>
          )}
          <button onClick={toggleStar} className={cn("p-1", pinned ? "text-amber-400" : "text-zinc-300 hover:text-zinc-500")} title="Favorite"><Star className="h-4 w-4" fill={pinned ? "currentColor" : "none"} /></button>
          {renaming ? (
            <span className="inline-flex items-center gap-1">
              <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(false) }} className="rounded border border-zinc-300 px-2 py-0.5 text-lg font-bold outline-none focus:border-zinc-500" />
              <button onClick={saveRename} className="text-emerald-600"><Check className="h-4 w-4" /></button>
            </span>
          ) : (
            <h1 className="truncate text-lg font-bold text-zinc-900">{report.name}</h1>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StyledSelect value={datePreset} onChange={(e) => setDatePreset(e.target.value)} className="h-9 min-w-[150px] text-sm">
            <option value="all">All time</option>
            {Object.entries(DATE_GROUPED).filter(([g]) => g !== "Common").map(([g, items]) => <optgroup key={g} label={g}>{items.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</optgroup>)}
          </StyledSelect>
          <Link href={`/reports/builder?report=${report.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800">Edit in report builder</Link>
          <div className="relative">
            <button onClick={() => setActionsOpen((o) => !o)} onBlur={() => setTimeout(() => setActionsOpen(false), 150)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400"><MoreHorizontal className="h-4 w-4" /> Actions</button>
            {actionsOpen && (
              <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                <button className={action} onMouseDown={(e) => { e.preventDefault(); doClone() }}><Copy className="h-3.5 w-3.5 text-zinc-400" /> Clone</button>
                <button className={action} onMouseDown={(e) => { e.preventDefault(); setActionsOpen(false); setNameDraft(report.name); setRenaming(true) }}><Pencil className="h-3.5 w-3.5 text-zinc-400" /> Rename</button>
                <button className={action} onMouseDown={(e) => { e.preventDefault(); setActionsOpen(false); setTagsOpen(true) }}><Tag className="h-3.5 w-3.5 text-zinc-400" /> Set tags</button>
                {report.isOwner && <button className={action} onMouseDown={(e) => { e.preventDefault(); setActionsOpen(false); setOwnerOpen(true) }}><UserCog className="h-3.5 w-3.5 text-zinc-400" /> Change owner</button>}
                <button className={action} onMouseDown={(e) => { e.preventDefault(); openDash() }}><LayoutDashboard className="h-3.5 w-3.5 text-zinc-400" /> Add to dashboard</button>
                <button className={action} onMouseDown={(e) => { e.preventDefault(); setActionsOpen(false); setExportOpen(true) }}><Download className="h-3.5 w-3.5 text-zinc-400" /> Export</button>
                <button className={cn(action, "text-red-600")} onMouseDown={(e) => { e.preventDefault(); doDelete() }}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Context chips */}
      <div className="flex items-center gap-2 border-b border-zinc-100 px-6 py-2 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-0.5">{DATE_PRESET_GROUPS.find((p) => p.value === datePreset)?.label ?? "All time"}</span>
        {tags.map((t) => <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{t}</span>)}
        <span className="ml-auto">Owner: {report.ownerName}</span>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-zinc-50 p-6">
        {cfg.viz !== "table" && (
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            {loading && !result ? <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</div>
              : result ? <ReportView result={result} style={cfg.style as any} /> : <p className="text-sm text-zinc-400">Couldn’t load this report.</p>}
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex gap-1 border-b border-zinc-100 px-3 pt-2">
            {(["summarized", "unsummarized"] as const).map((t) => (
              <button key={t} onClick={() => setDataTab(t)} className={cn("rounded-t-lg border-b-2 px-3 py-1.5 text-sm font-medium", dataTab === t ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800")}>{t === "summarized" ? "Summarized data" : "Unsummarized data"}</button>
            ))}
          </div>
          <div className="overflow-auto p-4">
            {dataLoading && !dataResult ? <div className="flex items-center gap-1.5 py-6 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading data…</div>
              : dataResult ? <DataTable result={dataResult} pageSize={25} sortable frozenFirst /> : <p className="py-6 text-sm text-zinc-400">No data.</p>}
          </div>
        </div>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject={String(cfg.primary).toLowerCase()} defaultName={report.name} count={result?.total} getData={async () => getReportRows(runCfg)} />

      {tagsOpen && (
        <Modal title="Set tags" onClose={() => setTagsOpen(false)}>
          <div className="flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{t}<button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button></span>)}</div>
          <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tagDraft.trim()) { setTags(Array.from(new Set([...tags, tagDraft.trim()]))); setTagDraft("") } }} placeholder="Add a tag, press Enter" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
          <button onClick={saveTags} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">Save tags</button>
        </Modal>
      )}
      {ownerOpen && (
        <Modal title="Change owner" onClose={() => setOwnerOpen(false)}>
          <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-100">
            {shareUsers.map((u) => <button key={u.id} onClick={() => changeOwner(u.id)} className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-zinc-50">{u.name || u.email}</button>)}
          </div>
        </Modal>
      )}
      {dashOpen && (
        <Modal title={`Add “${report.name}” to a dashboard`} onClose={() => setDashOpen(false)}>
          <div className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-100">
            {dashboards.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-400">No dashboards yet.</p>}
            {dashboards.map((d) => <div key={d.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-50"><span className="truncate text-sm text-zinc-800">{d.name}</span><button onClick={() => addToDash(d.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Add</button></div>)}
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><p className="text-sm font-semibold text-zinc-900">{title}</p><button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  )
}
