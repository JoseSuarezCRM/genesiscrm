"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, Pencil, GripVertical, CheckCircle2, AlertCircle, ArrowRight, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { createOrgRule, updateOrgRule, deleteOrgRule, reorderOrgRules, applyRulesToExistingPractices, OrgRuleInput } from "@/app/actions/org-rules"

interface Rule {
  id: string
  contains: string
  normalizedName: string
  order: number
}

interface Props {
  initialRules: Rule[]
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Rule
  onSave: (input: OrgRuleInput) => void
  onCancel: () => void
  saving: boolean
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
          <input
            value={normalizedName}
            onChange={(e) => setNormalizedName(e.target.value)}
            placeholder="e.g. PrimeCare Community Health"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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

export default function OrgRulesManager({ initialRules }: Props) {
  const [rules,      setRules]      = useState<Rule[]>(initialRules)
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
        <RuleForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={isPending} />
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
    </div>
  )
}
