"use client"

import { useState } from "react"
import {
  X, ChevronRight, ChevronLeft, Table2, LayoutGrid, CalendarDays, Link2, Users, Download,
  Save, RotateCcw, Check, Loader2, Columns3,
} from "lucide-react"
import StyledSelect from "@/components/ui/styled-select"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { showToast } from "@/components/toast"
import { BOARD_AGGS, VIEW_TYPES, type ObjectViewConfig, type ObjectViewType } from "@/lib/object-views"
import { dateProperties, numericProperties, type ObjectProperty } from "@/lib/object-columns"
import { cn } from "@/lib/utils"

// The right-hand drawer: name, view type, type-specific settings, data (pipeline /
// filters / sort / metrics), sharing and save actions.

type Sub = null | "board" | "calendar" | "pipeline" | "sharing"

const TYPE_ICON: Record<ObjectViewType, typeof Table2> = {
  table: Table2,
  board: LayoutGrid,
  calendar: CalendarDays,
}

function Row({ label, onClick, value, icon: Icon, shortcut, disabled }: {
  label: string; onClick?: () => void; value?: string; icon?: typeof Table2; shortcut?: string; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-zinc-400" />}
      <span className="flex-1 truncate">{label}</span>
      {value && <span className="max-w-[45%] truncate text-xs text-zinc-400">{value}</span>}
      {shortcut && <span className="text-[11px] text-zinc-300">{shortcut}</span>}
      {onClick && !shortcut && <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5 border-t border-zinc-100 px-3 py-3">
      <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</p>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
      <span className="truncate">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-zinc-300" />
    </label>
  )
}

export default function ViewSettingsPanel({
  open, onClose, config, onConfigChange, name, onRename, properties, pipelines,
  canRename, viewId, access, onAccessChange, shareUsers, shareTeams, canShare,
  dirty, saving, onSave, onReset, onExport, onOpenFilters, onOpenSort, onOpenColumns,
}: {
  open: boolean
  onClose: () => void
  config: ObjectViewConfig
  onConfigChange: (next: ObjectViewConfig) => void
  name: string
  onRename: (next: string) => void
  properties: ObjectProperty[]
  pipelines: { id: string; name: string }[]
  canRename: boolean
  viewId: string | null
  access: ViewAccessValue
  onAccessChange: (next: ViewAccessValue) => void
  shareUsers: ShareUser[]
  shareTeams: ShareTeam[]
  canShare: boolean
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
  onExport: () => void
  onOpenFilters: () => void
  onOpenSort: () => void
  onOpenColumns: () => void
}) {
  const [sub, setSub] = useState<Sub>(null)
  if (!open) return null

  const numeric = numericProperties(properties)
  const dates = dateProperties(properties)
  const dropdowns = properties.filter((p) => p.type === "DROPDOWN")
  const setBoard = (patch: Partial<ObjectViewConfig["board"]>) => onConfigChange({ ...config, board: { ...config.board, ...patch } })
  const setCal = (patch: Partial<ObjectViewConfig["calendar"]>) => onConfigChange({ ...config, calendar: { ...config.calendar, ...patch } })

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast("Link copied — it opens this view, type and pipeline.")
    } catch {
      showToast("Couldn't copy the link.")
    }
  }

  const header = (title: string, back?: () => void) => (
    <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-3">
      {back && <button onClick={back} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><ChevronLeft className="h-4 w-4" /></button>}
      <p className="flex-1 text-base font-semibold text-zinc-900">{title}</p>
      <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
    </div>
  )

  return (
    <aside className="flex w-80 shrink-0 flex-col self-start overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {sub === "board" ? (
        <>
          {header("Board settings", () => setSub(null))}
          <div className="space-y-3 overflow-y-auto p-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Card properties</p>
              <p className="text-xs text-zinc-400">Shown as lines under the card title.</p>
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-zinc-200 p-1">
                {properties.map((p) => {
                  const on = config.board.cardProperties.includes(p.id)
                  return (
                    <button key={p.id}
                      onClick={() => setBoard({ cardProperties: on ? config.board.cardProperties.filter((x) => x !== p.id) : [...config.board.cardProperties, p.id] })}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-50">
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-blue-600 bg-blue-600" : "border-zinc-300")}>
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span className="truncate text-zinc-700">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Column metrics</p>
              <p className="text-xs text-zinc-400">Up to two lines at the foot of every column.</p>
              {[0, 1].map((i) => {
                const m = config.board.metrics[i] ?? { propertyId: null, agg: "sum" as const }
                const needsProp = BOARD_AGGS.find((a) => a.value === m.agg)?.needsProperty ?? true
                return (
                  <div key={i} className="space-y-1.5 rounded-lg border border-zinc-200 p-2">
                    <p className="text-[11px] font-medium text-zinc-500">Line {i + 1}</p>
                    <StyledSelect value={m.agg}
                      onChange={(e) => {
                        const metrics = [...config.board.metrics]
                        metrics[i] = { ...m, agg: e.target.value as any }
                        setBoard({ metrics })
                      }}
                      className="h-8 w-full rounded-lg border border-zinc-200 px-2 text-sm">
                      {BOARD_AGGS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </StyledSelect>
                    {needsProp && (
                      <StyledSelect value={m.propertyId ?? ""}
                        onChange={(e) => {
                          const metrics = [...config.board.metrics]
                          metrics[i] = { ...m, propertyId: e.target.value || null }
                          setBoard({ metrics })
                        }}
                        className="h-8 w-full rounded-lg border border-zinc-200 px-2 text-sm">
                        <option value="">— Pick a number property —</option>
                        {numeric.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </StyledSelect>
                    )}
                    {m.agg === "weighted" && (
                      <p className="text-[11px] text-zinc-400">Multiplies the total by each stage&apos;s win probability.</p>
                    )}
                  </div>
                )
              })}
              {numeric.length === 0 && (
                <p className="text-[11px] text-amber-600">This object has no number properties yet, so only Record count can be shown.</p>
              )}
            </div>

            <div className="space-y-0.5">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Show on cards</p>
              <Toggle label="Association chips" checked={config.board.showChips} onChange={(v) => setBoard({ showChips: v })} />
              <Toggle label="Last activity" checked={config.board.showLastActivity} onChange={(v) => setBoard({ showLastActivity: v })} />
              <Toggle label="Quick actions" checked={config.board.showActions} onChange={(v) => setBoard({ showActions: v })} />
              <Toggle label="Time in stage" checked={config.board.showTimeInStage} onChange={(v) => setBoard({ showTimeInStage: v })} />
            </div>
            {config.board.collapsedStageIds.length > 0 && (
              <button onClick={() => setBoard({ collapsedStageIds: [] })} className="text-xs font-medium text-blue-600 hover:underline">
                Expand all columns ({config.board.collapsedStageIds.length} collapsed)
              </button>
            )}
          </div>
        </>
      ) : sub === "calendar" ? (
        <>
          {header("Calendar settings", () => setSub(null))}
          <div className="space-y-3 overflow-y-auto p-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Date property</p>
              <StyledSelect value={config.calendar.datePropertyId ?? ""} onChange={(e) => setCal({ datePropertyId: e.target.value || null })}
                className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm">
                <option value="">— Pick a date property —</option>
                {dates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
              {dates.length === 0 && <p className="text-[11px] text-amber-600">This object has no date properties yet.</p>}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Event title</p>
              <StyledSelect value={config.calendar.titlePropertyId ?? ""} onChange={(e) => setCal({ titlePropertyId: e.target.value || null })}
                className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm">
                <option value="">Record name (default)</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Default range</p>
              <StyledSelect value={config.calendar.range} onChange={(e) => setCal({ range: e.target.value as any })}
                className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm">
                <option value="month">Month</option><option value="week">Week</option><option value="day">Day</option>
              </StyledSelect>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Colour by</p>
              <StyledSelect value={config.calendar.colorBy} onChange={(e) => setCal({ colorBy: e.target.value })}
                className="h-9 w-full rounded-lg border border-zinc-200 px-2 text-sm">
                <option value="stage">Stage</option>
                {dropdowns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </StyledSelect>
            </div>
          </div>
        </>
      ) : sub === "pipeline" ? (
        <>
          {header("Pipeline", () => setSub(null))}
          <div className="space-y-0.5 overflow-y-auto p-3">
            <button onClick={() => onConfigChange({ ...config, pipelineId: null })}
              className={cn("flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-50", !config.pipelineId && "font-medium")}>
              First pipeline {!config.pipelineId && <Check className="h-4 w-4 text-blue-600" />}
            </button>
            {pipelines.map((p) => (
              <button key={p.id} onClick={() => onConfigChange({ ...config, pipelineId: p.id })}
                className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-zinc-50", config.pipelineId === p.id && "font-medium")}>
                <span className="truncate">{p.name}</span>
                {config.pipelineId === p.id && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            ))}
            {pipelines.length === 0 && <p className="px-2 py-2 text-xs text-zinc-400">No pipelines for this object yet.</p>}
          </div>
        </>
      ) : sub === "sharing" ? (
        <>
          {header("Manage sharing", () => setSub(null))}
          <div className="space-y-2 overflow-y-auto p-3">
            {canShare ? (
              <ViewAccessSelector value={access} onChange={onAccessChange} users={shareUsers} teams={shareTeams} />
            ) : (
              <p className="text-xs text-zinc-500">Only the view&apos;s owner can change who it&apos;s shared with.</p>
            )}
          </div>
        </>
      ) : (
        <>
          {header("View settings")}
          <div className="overflow-y-auto">
            <div className="space-y-1.5 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Name</p>
              <input value={name} onChange={(e) => onRename(e.target.value)} disabled={!canRename}
                placeholder={viewId ? "View name" : "Unsaved view"}
                className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-800 outline-none focus:border-zinc-400 disabled:text-zinc-400" />
            </div>

            <div className="space-y-1.5 border-t border-zinc-100 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">View type</p>
              <div className="flex items-center gap-2">
                {VIEW_TYPES.map((t) => {
                  const Icon = TYPE_ICON[t.value]
                  const on = config.type === t.value
                  return (
                    <button key={t.value} title={t.label} onClick={() => onConfigChange({ ...config, type: t.value })}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
                        on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400",
                      )}>
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
              {config.type === "board" && <Row label="Board settings" onClick={() => setSub("board")} icon={LayoutGrid} />}
              {config.type === "calendar" && <Row label="Calendar settings" onClick={() => setSub("calendar")} icon={CalendarDays} />}
              {config.type === "table" && <Row label="Edit columns" onClick={onOpenColumns} icon={Columns3} />}
            </div>

            <Section title="Data">
              {config.type !== "table" && (
                <Row label="Pipeline" onClick={() => setSub("pipeline")}
                  value={pipelines.find((p) => p.id === config.pipelineId)?.name ?? "First pipeline"} />
              )}
              <Row label="Filters" onClick={onOpenFilters} />
              <Row label="Sort by" onClick={onOpenSort} />
              {config.type === "board" && (
                <Toggle label="Show metrics" checked={config.board.showMetrics} onChange={(v) => setBoard({ showMetrics: v })} />
              )}
            </Section>

            <Section title="Sharing">
              <Row label="Copy link to view" onClick={copyLink} icon={Link2} />
              <Row label="Manage sharing" onClick={() => setSub("sharing")} icon={Users} />
              <Row label="Export" onClick={onExport} icon={Download} shortcut="Ctrl+Shift+X" />
            </Section>

            <Section title="Actions">
              <button onClick={onSave} disabled={saving || !viewId || !dirty}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> : <Save className="h-4 w-4 text-zinc-400" />}
                <span className="flex-1">Save changes</span>
                <span className="text-[11px] text-zinc-300">Ctrl+S</span>
              </button>
              <Row label="Reset to last save" onClick={onReset} icon={RotateCcw} disabled={!dirty} />
              {!viewId && <p className="px-2 pt-1 text-[11px] text-zinc-400">Save this as a view to keep these settings.</p>}
            </Section>
          </div>
        </>
      )}
    </aside>
  )
}
