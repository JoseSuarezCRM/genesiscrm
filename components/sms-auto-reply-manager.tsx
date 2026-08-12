"use client"

import StyledSelect from "@/components/ui/styled-select"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useState, useTransition } from "react"
import { Plus, Trash2, Pencil, CheckCircle2, AlertCircle, X, Check, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createSmsAutoResponse,
  updateSmsAutoResponse,
  deleteSmsAutoResponse,
  SmsAutoResponseInput,
} from "@/app/actions/sms-auto"

interface Rule {
  id: string
  isActive: boolean
  trigger: string
  matchType: string
  response: string
  description: string | null
  order: number
}

interface Props {
  initialRules: Rule[]
}

const MATCH_LABELS: Record<string, string> = {
  exact:       "Exact match",
  contains:    "Contains",
  starts_with: "Starts with",
}

const MATCH_HINTS: Record<string, string> = {
  exact:       "Reply is exactly this word",
  contains:    "Reply contains this word anywhere",
  starts_with: "Reply starts with this word",
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Rule
  onSave: (input: SmsAutoResponseInput) => void
  onCancel: () => void
  saving: boolean
}) {
  const [trigger,     setTrigger]     = useState(initial?.trigger     ?? "")
  const [matchType,   setMatchType]   = useState(initial?.matchType   ?? "exact")
  const [response,    setResponse]    = useState(initial?.response    ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [isActive,    setIsActive]    = useState(initial?.isActive    ?? true)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trigger.trim() || !response.trim()) return
    onSave({
      trigger:     trigger.trim(),
      matchType:   matchType as any,
      response:    response.trim(),
      description: description.trim() || undefined,
      isActive,
      order:       initial?.order ?? 999,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Trigger keyword *</label>
          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="e.g. YES, 1, CONFIRM"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Match type</label>
          <StyledSelect
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Object.entries(MATCH_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </StyledSelect>
          <p className="text-[10px] text-slate-400 mt-1">{MATCH_HINTS[matchType]}</p>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">Auto-reply message *</label>
        <textarea
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="e.g. Thank you! Your appointment is confirmed. See you soon."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="text-[10px] text-slate-400 mt-1">{response.length}/160 chars (1 SMS segment)</p>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">Description (internal note)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Appointment confirmation reply"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setIsActive((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              isActive ? "bg-blue-600" : "bg-slate-200"
            )}
          >
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", isActive ? "translate-x-4" : "translate-x-0.5")} />
          </div>
          <span className="text-xs text-slate-600">{isActive ? "Active" : "Inactive"}</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !trigger.trim() || !response.trim()}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add rule"}
          </button>
        </div>
      </div>
    </form>
  )
}

export default function SmsAutoReplyManager({ initialRules }: Props) {
  const [rules,      setRules]      = useState<Rule[]>(initialRules)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [success,    setSuccess]    = useState("")
  const [error,      setError]      = useState("")
  const [isPending,  startTransition] = useTransition()

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess("") }
    else         { setSuccess(msg); setError("") }
    setTimeout(() => { setSuccess(""); setError("") }, 3000)
  }

  function handleCreate(input: SmsAutoResponseInput) {
    startTransition(async () => {
      const res = await createSmsAutoResponse({ ...input, order: rules.length })
      if (!res.success) { flash(res.error ?? "Failed.", true); return }
      // Optimistically refresh — server revalidates
      setShowForm(false)
      flash("Rule added.")
      // Re-fetch by triggering router refresh via a fake state update
      window.location.reload()
    })
  }

  function handleUpdate(id: string, input: SmsAutoResponseInput) {
    startTransition(async () => {
      const res = await updateSmsAutoResponse(id, input)
      if (!res.success) { flash(res.error ?? "Failed.", true); return }
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...input } : r)))
      setEditingId(null)
      flash("Rule updated.")
    })
  }

  async function handleDelete(id: string) {
    if (!(await confirmDialog("Delete this auto-reply rule?"))) return
    startTransition(async () => {
      const res = await deleteSmsAutoResponse(id)
      if (!res.success) { flash(res.error ?? "Failed.", true); return }
      setRules((prev) => prev.filter((r) => r.id !== id))
      flash("Rule deleted.")
    })
  }

  function toggleActive(rule: Rule) {
    handleUpdate(rule.id, {
      trigger:     rule.trigger,
      matchType:   rule.matchType as any,
      response:    rule.response,
      description: rule.description ?? undefined,
      isActive:    !rule.isActive,
      order:       rule.order,
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">SMS Auto-Reply Rules</p>
          <p className="text-xs text-slate-400 mt-0.5">
            When a patient replies to an SMS, these rules are checked in order. The first match sends the auto-reply.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null) }}
          className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>
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

      {/* New rule form */}
      {showForm && (
        <RuleForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={isPending}
        />
      )}

      {/* Rules list */}
      {rules.length === 0 && !showForm ? (
        <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl bg-white">
          No auto-reply rules yet. Add one to automatically respond when patients reply to your SMS messages.
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
                <div className={cn(
                  "flex items-center gap-4 bg-white rounded-xl border px-4 py-3 transition-colors",
                  rule.isActive ? "border-slate-200" : "border-slate-100 opacity-60"
                )}>
                  <span className="text-xs text-slate-400 font-mono w-4 shrink-0">{i + 1}</span>

                  {/* Trigger */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-semibold text-sm text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                      {rule.trigger}
                    </span>
                    <span className="text-xs text-slate-400">{MATCH_LABELS[rule.matchType]}</span>
                  </div>

                  <span className="text-slate-300">→</span>

                  {/* Response */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">"{rule.response}"</p>
                    {rule.description && (
                      <p className="text-xs text-slate-400 truncate">{rule.description}</p>
                    )}
                  </div>

                  {/* Toggle */}
                  <div
                    onClick={() => toggleActive(rule)}
                    className={cn(
                      "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0",
                      rule.isActive ? "bg-blue-600" : "bg-slate-200"
                    )}
                  >
                    <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", rule.isActive ? "translate-x-4" : "translate-x-0.5")} />
                  </div>

                  {/* Actions */}
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
          Rules are checked top to bottom — first match wins. Toggle to enable/disable without deleting.
        </p>
      )}
    </div>
  )
}
