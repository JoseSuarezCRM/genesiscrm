"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { Plus, Trash2, Pencil, GripVertical, CheckCircle2, AlertCircle, ArrowRight, RefreshCw, Clock, History, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { createOrgRule, updateOrgRule, deleteOrgRule, reorderOrgRules, applyRulesToExistingPractices, setOrgRulesPoller, getOrgRulesRunLogs, OrgRuleInput, OrgRulesPollerConfig, OrgRulesRunLogEntry } from "@/app/actions/org-rules"

interface Rule {
  id: string
  contains: string
  normalizedName: string
  order: number
}

interface Props {
  initialRules: Rule[]
  initialPoller: OrgRulesPollerConfig
  initialLogs: OrgRulesRunLogEntry[]
  practiceNames: string[]
}

// Creatable combobox: pick an existing practice name (no typos) or type a new one.
function CanonicalCombo({ value, onChange, practiceNames }: { value: string; onChange: (v: string) => void; practiceNames: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const q = value.trim().toLowerCase()
  const matches = q ? practiceNames.filter((n) => n.toLowerCase().includes(q)) : practiceNames
  const exact = practiceNames.some((n) => n.toLowerCase() === q)

  return (
    <div className="relative" ref={ref}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Pick or type a practice…"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto py-1">
          {matches.length === 0 && !value.trim() && <p className="px-3 py-2 text-xs text-slate-400">No practices yet</p>}
          {matches.map((n) => (
            <button key={n} type="button" onClick={() => { onChange(n); setOpen(false) }}
              className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 truncate", n.toLowerCase() === q && "bg-green-50 text-green-700 font-medium")}>{n}</button>
          ))}
          {value.trim() && !exact && (
            <button type="button" onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 border-t border-slate-100 text-slate-500">
              Create new practice “<span className="font-medium text-slate-700">{value.trim()}</span>”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Recent runs: what got merged, most recent first, each expandable.
function RunLogSection({ logs }: { logs: OrgRulesRunLogEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (logs.length === 0) return null
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
        <History className="h-4 w-4 text-slate-400" /> Recent runs
      </p>
      <p className="text-xs text-slate-400 mt-0.5">What was merged the last times the rules ran (manually or automatically).</p>
      <div className="mt-3 space-y-1.5">
        {logs.map((log) => {
          const isOpen = openId === log.id
          return (
            <div key={log.id} className="border border-slate-100 rounded-lg">
              <button
                type="button" onClick={() => setOpenId(isOpen ? null : log.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 rounded-lg transition-colors"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
                <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded", log.trigger === "auto" ? "bg-violet-50 text-violet-700" : "bg-blue-50 text-blue-700")}>
                  {log.trigger === "auto" ? "Auto" : "Manual"}
                </span>
                <span className="text-sm text-slate-700 font-medium">
                  Merged {log.mergedCount} practice{log.mergedCount !== 1 ? "s" : ""}
                </span>
                <span className="text-xs text-slate-400 ml-auto shrink-0">{new Date(log.ranAt).toLocaleString()}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-1 space-y-1.5">
                  {log.merges.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs pl-6">
                      <span className="text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded truncate max-w-[45%]">{m.from}</span>
                      <ArrowRight className="h-3 w-3 text-slate-300 shrink-0" />
                      <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded truncate max-w-[45%]">{m.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const INTERVAL_OPTIONS = [
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every hour" },
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once a day" },
]

// Automatic re-apply: enable the background poller + choose how often it runs.
function PollerCard({ initial, onFlash }: { initial: OrgRulesPollerConfig; onFlash: (m: string, e?: boolean) => void }) {
  const [enabled, setEnabled] = useState(initial.enabled)
  const [interval, setInterval] = useState(initial.intervalMinutes)
  const lastRunAt = initial.lastRunAt
  const [isPending, startTransition] = useTransition()

  function save(next: { enabled: boolean; intervalMinutes: number }) {
    setEnabled(next.enabled); setInterval(next.intervalMinutes)
    startTransition(async () => {
      const res = await setOrgRulesPoller(next)
      if (!res.success) { onFlash(res.error ?? "Failed to save.", true); return }
      onFlash(next.enabled ? "Automatic re-apply is on." : "Automatic re-apply is off.")
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-slate-400" /> Automatic re-apply
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Runs the rules against existing practices on a schedule, so you don&apos;t have to click
            &ldquo;Re-apply to existing&rdquo; each time.
            {lastRunAt && <span className="text-slate-500"> Last run {new Date(lastRunAt).toLocaleString()}.</span>}
          </p>
        </div>
        <button
          type="button" role="switch" aria-checked={enabled} disabled={isPending}
          onClick={() => save({ enabled: !enabled, intervalMinutes: interval })}
          className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", enabled ? "bg-blue-600" : "bg-slate-300")}
        >
          <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", enabled ? "translate-x-5" : "translate-x-0.5")} />
        </button>
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Frequency</span>
          <select
            value={interval} disabled={isPending}
            onChange={(e) => save({ enabled, intervalMinutes: Number(e.target.value) })}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  saving,
  practiceNames,
}: {
  initial?: Rule
  onSave: (input: OrgRuleInput) => void
  onCancel: () => void
  saving: boolean
  practiceNames: string[]
}) {
  const [contains,       setContains]       = useState(initial?.contains       ?? "")
  const [normalizedName, setNormalizedName] = useState(initial?.normalizedName ?? "")

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (contains.trim() && normalizedName.trim()) onSave({ contains, normalizedName, order: initial?.order ?? 999 }) }}
      className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">
            If org name <span className="text-blue-600">contains</span>
          </label>
          <input
            autoFocus
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder="e.g. PrimeCare"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">
            → Use this <span className="text-green-600">canonical name</span>
          </label>
          <CanonicalCombo value={normalizedName} onChange={setNormalizedName} practiceNames={practiceNames} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100">Cancel</button>
        <button type="submit" disabled={saving || !contains.trim() || !normalizedName.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving…" : initial ? "Save changes" : "Add rule"}
        </button>
      </div>
    </form>
  )
}

export default function OrgRulesManager({ initialRules, initialPoller, initialLogs, practiceNames }: Props) {
  const [rules,      setRules]      = useState<Rule[]>(initialRules)
  const [logs,       setLogs]       = useState<OrgRulesRunLogEntry[]>(initialLogs)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [success,    setSuccess]    = useState("")
  const [error,      setError]      = useState("")
  const [dragIdx,    setDragIdx]    = useState<number | null>(null)
  const [isPending,  startTransition] = useTransition()

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess("") } else { setSuccess(msg); setError("") }
    setTimeout(() => { setSuccess(""); setError("") }, 3000)
  }

  function handleCreate(input: OrgRuleInput) {
    startTransition(async () => {
      const res = await createOrgRule(input)
      if (!res.success) { flash(res.error ?? "Failed.", true); return }
      setShowForm(false)
      flash("Rule added.")
      window.location.reload()
    })
  }

  function handleUpdate(id: string, input: OrgRuleInput) {
    startTransition(async () => {
      const res = await updateOrgRule(id, input)
      if (!res.success) { flash(res.error ?? "Failed.", true); return }
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...input } : r)))
      setEditingId(null)
      flash("Rule updated.")
    })
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this rule?")) return
    startTransition(async () => {
      const res = await deleteOrgRule(id)
      if (!res.success) { flash(res.error ?? "Failed.", true); return }
      setRules((prev) => prev.filter((r) => r.id !== id))
      flash("Rule deleted.")
    })
  }

  // ── Drag to reorder ────────────────────────────────────────────────────────
  function handleDragStart(idx: number) { setDragIdx(idx) }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const next = [...rules]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    setDragIdx(idx)
    setRules(next)
  }

  function handleDragEnd() {
    setDragIdx(null)
    startTransition(async () => {
      await reorderOrgRules(rules.map((r) => r.id))
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Organization Name Rules</p>
          <p className="text-xs text-slate-400 mt-0.5">
            When a referral's org name contains a keyword, it maps to the canonical practice name and links or creates the organization automatically.
            Rules are checked <span className="font-medium">top to bottom</span> — first match wins.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rules.length > 0 && (
            <button
              disabled={isPending}
              onClick={() => {
                if (!confirm("This will merge all existing practices that match a rule into their canonical name. Continue?")) return
                startTransition(async () => {
                  const res = await applyRulesToExistingPractices()
                  if (!res.success) { flash(res.error ?? "Failed.", true); return }
                  flash(res.merged > 0 ? `Merged ${res.merged} practice${res.merged !== 1 ? "s" : ""}.` : "No practices needed merging.")
                  if (res.merged > 0) setLogs(await getOrgRulesRunLogs())
                })
              }}
              className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-apply to existing
            </button>
          )}
          <button
            onClick={() => { setShowForm(true); setEditingId(null) }}
            className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add rule
          </button>
        </div>
      </div>

      <PollerCard initial={initialPoller} onFlash={flash} />

      {success && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {showForm && (
        <RuleForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={isPending} practiceNames={practiceNames} />
      )}

      {rules.length === 0 && !showForm ? (
        <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl bg-white">
          No rules yet. Add one to start normalizing organization names on referrals.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div key={rule.id}>
              {editingId === rule.id ? (
                <RuleForm
                  initial={rule}
                  onSave={(input) => handleUpdate(rule.id, input)}
                  onCancel={() => setEditingId(null)}
                  saving={isPending}
                  practiceNames={practiceNames}
                />
              ) : (
                <div
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 transition-colors",
                    dragIdx === i && "opacity-50 border-blue-300 bg-blue-50"
                  )}
                >
                  <GripVertical className="h-4 w-4 text-slate-300 cursor-grab shrink-0" />
                  <span className="text-xs text-slate-400 font-mono w-4 shrink-0">{i + 1}</span>

                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-slate-400">contains</span>
                      <span className="font-mono text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap">
                        {rule.contains}
                      </span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                    <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-md truncate">
                      {rule.normalizedName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingId(rule.id)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rules.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          Drag rows to reorder · first match wins · matching is case-insensitive
        </p>
      )}

      <RunLogSection logs={logs} />
    </div>
  )
}
