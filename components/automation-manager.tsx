"use client"

import { useState, useTransition } from "react"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import {
  createAutomation,
  updateAutomation,
  toggleAutomation,
  deleteAutomation,
  runScheduledAutomationsAction,
} from "@/app/actions/automations"
import { Zap, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Play, ChevronDown, ChevronUp, Info } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Automation {
  id: string
  name: string
  description: string | null
  isActive: boolean
  triggerType: AutomationTrigger
  triggerConfig: Record<string, unknown>
  actionType: AutomationAction
  actionConfig: Record<string, unknown>
  createdAt: Date
  createdBy: { name: string | null; email: string }
  _count: { runs: number }
}

interface User { id: string; name: string | null; email: string }
interface Tag { id: string; name: string; color: string }
interface Practice { id: string; name: string }

interface Props {
  automations: Automation[]
  users: User[]
  tags: Tag[]
  practices: Practice[]
  currentUserId: string
}

// ─── Label maps ───────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  REFERRAL_CREATED: "New referral created",
  REFERRAL_STATUS_CHANGED: "Referral status changed",
  PROVIDER_REFERRAL_COUNT: "Provider reaches referral count",
  PRACTICE_REFERRAL_COUNT: "Practice reaches referral count",
  REFERRAL_NO_ACTIVITY: "Referral has no activity",
  APPOINTMENT_UPCOMING: "Appointment coming up",
  CALL_ATTEMPTS_REACHED: "Call attempts reached",
  REFERRAL_ASSIGNED: "Referral assigned to user",
}

const ACTION_LABELS: Record<AutomationAction, string> = {
  CREATE_TASK: "Create a task",
  SEND_NOTIFICATION: "Send in-app notification",
  UPDATE_REFERRAL_STATUS: "Update referral status",
  ASSIGN_REFERRAL: "Assign referral to user",
  ADD_TAG: "Add tag to referral",
}

const TRIGGER_COLORS: Record<AutomationTrigger, string> = {
  REFERRAL_CREATED: "bg-green-100 text-green-700",
  REFERRAL_STATUS_CHANGED: "bg-blue-100 text-blue-700",
  PROVIDER_REFERRAL_COUNT: "bg-purple-100 text-purple-700",
  PRACTICE_REFERRAL_COUNT: "bg-indigo-100 text-indigo-700",
  REFERRAL_NO_ACTIVITY: "bg-amber-100 text-amber-700",
  APPOINTMENT_UPCOMING: "bg-cyan-100 text-cyan-700",
  CALL_ATTEMPTS_REACHED: "bg-orange-100 text-orange-700",
  REFERRAL_ASSIGNED: "bg-teal-100 text-teal-700",
}

const ACTION_COLORS: Record<AutomationAction, string> = {
  CREATE_TASK: "bg-violet-100 text-violet-700",
  SEND_NOTIFICATION: "bg-pink-100 text-pink-700",
  UPDATE_REFERRAL_STATUS: "bg-blue-100 text-blue-700",
  ASSIGN_REFERRAL: "bg-teal-100 text-teal-700",
  ADD_TAG: "bg-slate-100 text-slate-700",
}

const STATUS_OPTIONS: { value: ReferralStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "NO_SHOW", label: "No Show" },
  { value: "LOST", label: "Lost" },
]

const PERIOD_OPTIONS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "quarter", label: "This quarter" },
  { value: "all_time", label: "All time" },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
]

const TEMPLATE_VARS = ["{patient_name}", "{patient_first_name}", "{provider_name}", "{practice_name}", "{count}", "{period}", "{days}", "{status}", "{call_count}"]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyTriggerConfig(type: AutomationTrigger): Record<string, unknown> {
  if (type === "REFERRAL_STATUS_CHANGED") return { fromStatus: "", toStatus: "" }
  if (type === "PROVIDER_REFERRAL_COUNT") return { count: 5, period: "month" }
  if (type === "PRACTICE_REFERRAL_COUNT") return { count: 10, period: "month" }
  if (type === "REFERRAL_NO_ACTIVITY") return { days: 7 }
  if (type === "APPOINTMENT_UPCOMING") return { daysAhead: 1 }
  if (type === "CALL_ATTEMPTS_REACHED") return { count: 3 }
  if (type === "REFERRAL_ASSIGNED") return { assignedToId: "" }
  return {}
}

function emptyActionConfig(type: AutomationAction): Record<string, unknown> {
  if (type === "CREATE_TASK") return { title: "", description: "", priority: "NORMAL", assignedToId: "", dueDaysFromNow: "" }
  if (type === "SEND_NOTIFICATION") return { message: "", userId: "" }
  if (type === "UPDATE_REFERRAL_STATUS") return { status: "" }
  if (type === "ASSIGN_REFERRAL") return { userId: "" }
  if (type === "ADD_TAG") return { tagId: "" }
  return {}
}

// ─── Trigger config form ──────────────────────────────────────────────────────

function TriggerConfigFields({
  type,
  config,
  onChange,
  users,
  practices,
}: {
  type: AutomationTrigger
  config: Record<string, unknown>
  onChange: (cfg: Record<string, unknown>) => void
  users: User[]
  practices: Practice[]
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val })

  if (type === "REFERRAL_CREATED") {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Filter by practice (optional)</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.practiceId as string) || ""} onChange={e => set("practiceId", e.target.value || undefined)}>
            <option value="">Any practice</option>
            {practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
    )
  }

  if (type === "REFERRAL_STATUS_CHANGED") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From status (optional)</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.fromStatus as string) || ""} onChange={e => set("fromStatus", e.target.value || undefined)}>
            <option value="">Any</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To status (optional)</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.toStatus as string) || ""} onChange={e => set("toStatus", e.target.value || undefined)}>
            <option value="">Any</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
    )
  }

  if (type === "PROVIDER_REFERRAL_COUNT" || type === "PRACTICE_REFERRAL_COUNT") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Referral count threshold</label>
          <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.count as number) || 5} onChange={e => set("count", Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Period</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.period as string) || "month"} onChange={e => set("period", e.target.value)}>
            {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
    )
  }

  if (type === "REFERRAL_NO_ACTIVITY") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">No activity for (days)</label>
        <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.days as number) || 7} onChange={e => set("days", Number(e.target.value))} />
        <p className="text-xs text-slate-500 mt-1">Fires for open referrals not updated in this many days.</p>
      </div>
    )
  }

  if (type === "APPOINTMENT_UPCOMING") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Days before appointment</label>
        <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.daysAhead as number) || 1} onChange={e => set("daysAhead", Number(e.target.value))} />
      </div>
    )
  }

  if (type === "CALL_ATTEMPTS_REACHED") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Number of call attempts</label>
        <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.count as number) || 3} onChange={e => set("count", Number(e.target.value))}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>
    )
  }

  if (type === "REFERRAL_ASSIGNED") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Filter by assignee (optional)</label>
        <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.assignedToId as string) || ""} onChange={e => set("assignedToId", e.target.value || undefined)}>
          <option value="">Any user</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>
      </div>
    )
  }

  return null
}

// ─── Action config form ───────────────────────────────────────────────────────

function ActionConfigFields({
  type,
  config,
  onChange,
  users,
  tags,
}: {
  type: AutomationAction
  config: Record<string, unknown>
  onChange: (cfg: Record<string, unknown>) => void
  users: User[]
  tags: Tag[]
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val })
  const [showVars, setShowVars] = useState(false)

  if (type === "CREATE_TASK") {
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Task title *</label>
            <button type="button" onClick={() => setShowVars(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Info className="h-3 w-3" /> Template vars
            </button>
          </div>
          {showVars && (
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARS.map(v => (
                <span key={v} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-slate-200"
                  onClick={() => set("title", ((config.title as string) || "") + v)}>{v}</span>
              ))}
            </div>
          )}
          <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Follow up with {provider_name}" value={(config.title as string) || ""} onChange={e => set("title", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
          <textarea rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-none" value={(config.description as string) || ""} onChange={e => set("description", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.priority as string) || "NORMAL"} onChange={e => set("priority", e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due in (days, optional)</label>
            <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. 3" value={(config.dueDaysFromNow as string) || ""} onChange={e => set("dueDaysFromNow", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Assign task to</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.assignedToId as string) || ""} onChange={e => set("assignedToId", e.target.value)}>
            <option value="">Unassigned</option>
            <option value="assigned_to">Referral assignee</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>
        </div>
      </div>
    )
  }

  if (type === "SEND_NOTIFICATION") {
    return (
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Message *</label>
            <button type="button" onClick={() => setShowVars(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Info className="h-3 w-3" /> Template vars
            </button>
          </div>
          {showVars && (
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARS.map(v => (
                <span key={v} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-slate-200"
                  onClick={() => set("message", ((config.message as string) || "") + v)}>{v}</span>
              ))}
            </div>
          )}
          <textarea rows={2} className="w-full border rounded-md px-3 py-2 text-sm resize-none" placeholder="e.g. {provider_name} has sent {count} referrals {period}" value={(config.message as string) || ""} onChange={e => set("message", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notify</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.userId as string) || ""} onChange={e => set("userId", e.target.value)}>
            <option value="">Select recipient</option>
            <option value="all_admins">All admins</option>
            <option value="assigned_to">Referral assignee</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </select>
        </div>
      </div>
    )
  }

  if (type === "UPDATE_REFERRAL_STATUS") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">New status *</label>
        <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.status as string) || ""} onChange={e => set("status", e.target.value)}>
          <option value="">Select status</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    )
  }

  if (type === "ASSIGN_REFERRAL") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Assign to *</label>
        <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.userId as string) || ""} onChange={e => set("userId", e.target.value)}>
          <option value="">Select user</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </select>
      </div>
    )
  }

  if (type === "ADD_TAG") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Tag *</label>
        <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.tagId as string) || ""} onChange={e => set("tagId", e.target.value)}>
          <option value="">Select tag</option>
          {tags.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    )
  }

  return null
}

// ─── Automation form dialog ───────────────────────────────────────────────────

function AutomationDialog({
  open,
  onClose,
  editing,
  users,
  tags,
  practices,
}: {
  open: boolean
  onClose: (refresh?: boolean) => void
  editing: Automation | null
  users: User[]
  tags: Tag[]
  practices: Practice[]
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [triggerType, setTriggerType] = useState<AutomationTrigger>(editing?.triggerType ?? "REFERRAL_CREATED")
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(editing?.triggerConfig ?? emptyTriggerConfig("REFERRAL_CREATED"))
  const [actionType, setActionType] = useState<AutomationAction>(editing?.actionType ?? "CREATE_TASK")
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>(editing?.actionConfig ?? emptyActionConfig("CREATE_TASK"))
  const [error, setError] = useState("")

  if (!open) return null

  function handleTriggerChange(t: AutomationTrigger) {
    setTriggerType(t)
    setTriggerConfig(emptyTriggerConfig(t))
  }

  function handleActionChange(a: AutomationAction) {
    setActionType(a)
    setActionConfig(emptyActionConfig(a))
  }

  function handleSubmit() {
    if (!name.trim()) { setError("Name is required"); return }
    setError("")
    startTransition(async () => {
      if (editing) {
        await updateAutomation(editing.id, { name: name.trim(), description: description.trim() || undefined, triggerType, triggerConfig, actionType, actionConfig, isActive: editing.isActive })
      } else {
        await createAutomation({ name: name.trim(), description: description.trim() || undefined, triggerType, triggerConfig, actionType, actionConfig })
      }
      onClose(true)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-base font-semibold text-slate-900">{editing ? "Edit Automation" : "New Automation Rule"}</h2>
          <button onClick={() => onClose()} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name / description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Rule name *</label>
              <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Notify team when provider hits 5 referrals" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
              <input className="w-full border rounded-md px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>

          {/* Trigger */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-xs font-bold shrink-0">T</div>
              <h3 className="text-sm font-semibold text-slate-700">TRIGGER — When this happens</h3>
            </div>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={triggerType} onChange={e => handleTriggerChange(e.target.value as AutomationTrigger)}>
              {(Object.keys(TRIGGER_LABELS) as AutomationTrigger[]).map(t => (
                <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
              ))}
            </select>
            <TriggerConfigFields type={triggerType} config={triggerConfig} onChange={setTriggerConfig} users={users} practices={practices} />
          </div>

          {/* Action */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold shrink-0">A</div>
              <h3 className="text-sm font-semibold text-slate-700">ACTION — Do this</h3>
            </div>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={actionType} onChange={e => handleActionChange(e.target.value as AutomationAction)}>
              {(Object.keys(ACTION_LABELS) as AutomationAction[]).map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
            <ActionConfigFields type={actionType} config={actionConfig} onChange={setActionConfig} users={users} tags={tags} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={() => onClose()} className="px-4 py-2 text-sm rounded-md border hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={isPending} className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {isPending ? "Saving…" : editing ? "Save changes" : "Create rule"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Automation row ───────────────────────────────────────────────────────────

function AutomationRow({
  auto,
  onEdit,
  onDeleted,
  onToggled,
}: {
  auto: Automation
  onEdit: () => void
  onDeleted: () => void
  onToggled: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)

  function handleToggle() {
    startTransition(async () => {
      await toggleAutomation(auto.id, !auto.isActive)
      onToggled()
    })
  }

  function handleDelete() {
    if (!confirm(`Delete automation "${auto.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteAutomation(auto.id)
      onDeleted()
    })
  }

  return (
    <div className={cn("border rounded-lg bg-white transition-all", !auto.isActive && "opacity-60")}>
      <div className="flex items-start gap-3 p-4">
        <button onClick={handleToggle} disabled={isPending} className="mt-0.5 text-slate-400 hover:text-blue-600 transition-colors shrink-0" title={auto.isActive ? "Disable" : "Enable"}>
          {auto.isActive ? <ToggleRight className="h-5 w-5 text-blue-600" /> : <ToggleLeft className="h-5 w-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{auto.name}</p>
              {auto.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{auto.description}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={handleDelete} disabled={isPending} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", TRIGGER_COLORS[auto.triggerType])}>
              {TRIGGER_LABELS[auto.triggerType]}
            </span>
            <span className="text-xs text-slate-400">→</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ACTION_COLORS[auto.actionType])}>
              {ACTION_LABELS[auto.actionType]}
            </span>
            <span className="text-xs text-slate-400 ml-auto">{auto._count.runs} run{auto._count.runs !== 1 ? "s" : ""}</span>
          </div>
        </div>

        <button onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t bg-slate-50 px-4 py-3 rounded-b-lg">
          <div className="grid grid-cols-2 gap-4 text-xs text-slate-600">
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Trigger config</p>
              {Object.keys(auto.triggerConfig).length === 0
                ? <p className="text-slate-400 italic">No filter conditions</p>
                : Object.entries(auto.triggerConfig).map(([k, v]) => (
                  <p key={k}><span className="font-medium">{k}:</span> {String(v)}</p>
                ))}
            </div>
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Action config</p>
              {Object.entries(auto.actionConfig).map(([k, v]) => v ? (
                <p key={k}><span className="font-medium">{k}:</span> {String(v)}</p>
              ) : null)}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Created by {auto.createdBy.name || auto.createdBy.email}</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AutomationManager({ automations: initial, users, tags, practices }: Props) {
  const [automations, setAutomations] = useState(initial)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [runPending, startRunTransition] = useTransition()
  const [runMsg, setRunMsg] = useState("")

  function openCreate() { setEditing(null); setDialogOpen(true) }
  function openEdit(a: Automation) { setEditing(a); setDialogOpen(true) }

  function handleClose(refresh?: boolean) {
    setDialogOpen(false)
    setEditing(null)
    if (refresh) window.location.reload()
  }

  function handleDeleted() { window.location.reload() }
  function handleToggled() { window.location.reload() }

  function handleRunScheduled() {
    setRunMsg("")
    startRunTransition(async () => {
      await runScheduledAutomationsAction()
      setRunMsg("Scheduled checks completed.")
      setTimeout(() => setRunMsg(""), 4000)
    })
  }

  const activeCount = automations.filter(a => a.isActive).length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunScheduled}
            disabled={runPending}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            {runPending ? "Running…" : "Run scheduled checks now"}
          </button>
          {runMsg && <span className="text-xs text-green-600">{runMsg}</span>}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New rule
        </button>
      </div>

      {/* List */}
      {automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl">
          <Zap className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No automation rules yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Create rules to automatically create tasks, send notifications, update statuses, and more based on referral events.
          </p>
          <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" /> Create your first rule
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map(auto => (
            <AutomationRow
              key={auto.id}
              auto={auto}
              onEdit={() => openEdit(auto)}
              onDeleted={handleDeleted}
              onToggled={handleToggled}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      <AutomationDialog open={dialogOpen} onClose={handleClose} editing={editing} users={users} tags={tags} practices={practices} />
    </div>
  )
}
