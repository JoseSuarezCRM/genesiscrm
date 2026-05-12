"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import {
  createAutomation,
  updateAutomation,
  toggleAutomation,
  deleteAutomation,
  runScheduledAutomationsAction,
} from "@/app/actions/automations"
import { Zap, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Play, ChevronDown, ChevronUp, Info, X } from "lucide-react"
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
interface Location { id: string; name: string }
interface Pipeline { id: string; name: string; color: string }

interface Props {
  automations: Automation[]
  users: User[]
  tags: Tag[]
  practices: Practice[]
  locations: Location[]
  pipelines?: Pipeline[]
  currentUserId: string
}

// ─── Label maps ───────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  REFERRAL_CREATED: "New referral created",
  REFERRAL_STATUS_CHANGED: "Referral status changed",
  PROVIDER_REFERRAL_COUNT: "Provider reaches referral count",
  PRACTICE_REFERRAL_COUNT: "Practice reaches referral count",
  LOCATION_REFERRAL_COUNT: "Location reaches referral count",
  REFERRAL_NO_ACTIVITY: "Referral has no activity",
  APPOINTMENT_UPCOMING: "Appointment coming up",
  APPOINTMENT_OVERDUE: "Appointment date passed (still Scheduled)",
  REFERRAL_STALE: "Referral has no appointment set",
  CALL_ATTEMPTS_REACHED: "Call attempts reached",
  REFERRAL_ASSIGNED: "Referral assigned to user",
  TAG_ADDED: "Tag added to referral",
  DOCUMENT_UPLOADED: "Document uploaded to referral",
  AUTH_STATUS_CHANGED: "Auth status changed",
  EMBED_REFERRAL_RECEIVED: "Referral received via embed form",
  PIPELINE_CHANGED: "Referral moved to pipeline",
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_TASK: "Create a task",
  SEND_NOTIFICATION: "Send in-app notification",
  UPDATE_REFERRAL_STATUS: "Update referral status",
  ASSIGN_REFERRAL: "Assign referral to user",
  ADD_TAG: "Add tag to referral",
  SEND_EMAIL: "Send email",
  SEND_SMS: "Send SMS to patient",
}

const TRIGGER_COLORS: Record<string, string> = {
  REFERRAL_CREATED: "bg-green-100 text-green-700",
  REFERRAL_STATUS_CHANGED: "bg-blue-100 text-blue-700",
  PROVIDER_REFERRAL_COUNT: "bg-purple-100 text-purple-700",
  PRACTICE_REFERRAL_COUNT: "bg-indigo-100 text-indigo-700",
  LOCATION_REFERRAL_COUNT: "bg-violet-100 text-violet-700",
  REFERRAL_NO_ACTIVITY: "bg-amber-100 text-amber-700",
  APPOINTMENT_UPCOMING: "bg-cyan-100 text-cyan-700",
  APPOINTMENT_OVERDUE: "bg-red-100 text-red-700",
  REFERRAL_STALE: "bg-orange-100 text-orange-700",
  CALL_ATTEMPTS_REACHED: "bg-orange-100 text-orange-700",
  REFERRAL_ASSIGNED: "bg-teal-100 text-teal-700",
  TAG_ADDED: "bg-pink-100 text-pink-700",
  DOCUMENT_UPLOADED: "bg-sky-100 text-sky-700",
  AUTH_STATUS_CHANGED: "bg-yellow-100 text-yellow-700",
  EMBED_REFERRAL_RECEIVED: "bg-emerald-100 text-emerald-700",
  PIPELINE_CHANGED: "bg-violet-100 text-violet-700",
}

const ACTION_COLORS: Record<string, string> = {
  CREATE_TASK: "bg-violet-100 text-violet-700",
  SEND_NOTIFICATION: "bg-pink-100 text-pink-700",
  UPDATE_REFERRAL_STATUS: "bg-blue-100 text-blue-700",
  ASSIGN_REFERRAL: "bg-teal-100 text-teal-700",
  ADD_TAG: "bg-slate-100 text-slate-700",
  SEND_EMAIL: "bg-sky-100 text-sky-700",
  SEND_SMS: "bg-green-100 text-green-700",
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "READY_FOR_CALL", label: "Ready for Call" },
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

const TEMPLATE_VARS = [
  "{patient_name}", "{patient_first_name}", "{provider_name}", "{practice_name}",
  "{count}", "{period}", "{days}", "{status}", "{call_count}", "{auth_status}", "{tag_name}",
  "{referral_url}", "{referral_button}",
]

// Triggers that fire on a specific referral (support extra conditions)
const REFERRAL_TRIGGERS = new Set([
  "REFERRAL_CREATED", "REFERRAL_STATUS_CHANGED", "CALL_ATTEMPTS_REACHED",
  "REFERRAL_ASSIGNED", "REFERRAL_NO_ACTIVITY", "APPOINTMENT_UPCOMING",
  "APPOINTMENT_OVERDUE", "REFERRAL_STALE", "TAG_ADDED", "DOCUMENT_UPLOADED",
  "AUTH_STATUS_CHANGED", "EMBED_REFERRAL_RECEIVED", "PIPELINE_CHANGED",
])

// ─── Multi-criteria condition builder ────────────────────────────────────────

interface Condition { field: string; op: string; value: string }

const CONDITION_FIELDS = [
  { value: "practiceId",       label: "Referring Practice" },
  { value: "locationId",       label: "Referring Location" },
  { value: "assignedToId",     label: "Assigned To" },
  { value: "status",           label: "Status" },
  { value: "insuranceProvider", label: "Insurance Provider" },
  { value: "tagId",            label: "Has Tag" },
]

const CONDITION_OPS: Record<string, { value: string; label: string }[]> = {
  practiceId:       [{ value: "eq", label: "is" }, { value: "ne", label: "is not" }, { value: "empty", label: "is empty" }],
  locationId:       [{ value: "eq", label: "is" }, { value: "ne", label: "is not" }, { value: "empty", label: "is empty" }],
  assignedToId:     [{ value: "eq", label: "is" }, { value: "ne", label: "is not" }, { value: "unassigned", label: "is unassigned" }],
  status:           [{ value: "eq", label: "is" }, { value: "ne", label: "is not" }],
  insuranceProvider:[{ value: "contains", label: "contains" }, { value: "eq", label: "equals" }, { value: "empty", label: "is empty" }],
  tagId:            [{ value: "has", label: "has tag" }, { value: "not_has", label: "does not have tag" }],
}

function ConditionValueInput({
  field, op, value, onChange, users, practices, locations, tags,
}: {
  field: string; op: string; value: string; onChange: (v: string) => void
  users: User[]; practices: Practice[]; locations: Location[]; tags: Tag[]
}) {
  if (op === "empty" || op === "unassigned") return null
  if (field === "practiceId") return (
    <select className="flex-1 border rounded-md px-2 py-1.5 text-xs" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select practice</option>
      {practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
  if (field === "locationId") return (
    <select className="flex-1 border rounded-md px-2 py-1.5 text-xs" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select location</option>
      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  )
  if (field === "assignedToId") return (
    <select className="flex-1 border rounded-md px-2 py-1.5 text-xs" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select user</option>
      {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
    </select>
  )
  if (field === "status") return (
    <select className="flex-1 border rounded-md px-2 py-1.5 text-xs" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select status</option>
      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  )
  if (field === "tagId") return (
    <select className="flex-1 border rounded-md px-2 py-1.5 text-xs" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select tag</option>
      {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  )
  return <input className="flex-1 border rounded-md px-2 py-1.5 text-xs" placeholder="Value…" value={value} onChange={e => onChange(e.target.value)} />
}

function ConditionsBuilder({
  conditions, onChange, users, practices, locations, tags,
}: {
  conditions: Condition[]
  onChange: (c: Condition[]) => void
  users: User[]; practices: Practice[]; locations: Location[]; tags: Tag[]
}) {
  function add() {
    onChange([...conditions, { field: "practiceId", op: "eq", value: "" }])
  }
  function remove(i: number) {
    onChange(conditions.filter((_, idx) => idx !== i))
  }
  function update(i: number, patch: Partial<Condition>) {
    onChange(conditions.map((c, idx) => {
      if (idx !== i) return c
      const next = { ...c, ...patch }
      // reset op/value when field changes
      if (patch.field && patch.field !== c.field) {
        next.op = CONDITION_OPS[patch.field]?.[0]?.value ?? "eq"
        next.value = ""
      }
      return next
    }))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Additional conditions (AND)</p>
        <button type="button" onClick={add} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add condition
        </button>
      </div>
      {conditions.length === 0 && (
        <p className="text-xs text-slate-400 italic">No extra conditions — trigger fires for all referrals.</p>
      )}
      {conditions.map((cond, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <select
            className="border rounded-md px-2 py-1.5 text-xs"
            value={cond.field}
            onChange={e => update(i, { field: e.target.value })}
          >
            {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            className="border rounded-md px-2 py-1.5 text-xs"
            value={cond.op}
            onChange={e => update(i, { op: e.target.value })}
          >
            {(CONDITION_OPS[cond.field] ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ConditionValueInput
            field={cond.field} op={cond.op} value={cond.value}
            onChange={v => update(i, { value: v })}
            users={users} practices={practices} locations={locations} tags={tags}
          />
          <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyTriggerConfig(type: string): Record<string, unknown> {
  if (type === "REFERRAL_STATUS_CHANGED") return { fromStatus: "", toStatus: "", conditions: [] }
  if (type === "PROVIDER_REFERRAL_COUNT") return { count: 5, period: "month" }
  if (type === "PRACTICE_REFERRAL_COUNT") return { count: 10, period: "month" }
  if (type === "LOCATION_REFERRAL_COUNT") return { count: 10, period: "month" }
  if (type === "REFERRAL_NO_ACTIVITY") return { days: 7, statusFilter: "", conditions: [] }
  if (type === "APPOINTMENT_UPCOMING") return { daysAhead: 1, conditions: [] }
  if (type === "APPOINTMENT_OVERDUE") return { daysOverdue: 0, conditions: [] }
  if (type === "REFERRAL_STALE") return { days: 14, conditions: [] }
  if (type === "CALL_ATTEMPTS_REACHED") return { count: 3, conditions: [] }
  if (type === "REFERRAL_ASSIGNED") return { assignedToId: "", conditions: [] }
  if (type === "TAG_ADDED") return { tagId: "", conditions: [] }
  if (type === "AUTH_STATUS_CHANGED") return { toAuthStatus: "", conditions: [] }
  if (type === "PIPELINE_CHANGED") return { fromPipelineId: "", toPipelineId: "", conditions: [] }
  return { conditions: [] } // REFERRAL_CREATED, DOCUMENT_UPLOADED, EMBED_REFERRAL_RECEIVED
}

function emptyActionConfig(type: AutomationAction): Record<string, unknown> {
  if (type === "CREATE_TASK") return { title: "", description: "", priority: "NORMAL", assignedToId: "", dueDaysFromNow: "" }
  if (type === "SEND_NOTIFICATION") return { message: "", userId: "" }
  if (type === "UPDATE_REFERRAL_STATUS") return { status: "" }
  if (type === "ASSIGN_REFERRAL") return { userId: "" }
  if (type === "ADD_TAG") return { tagId: "" }
  if (type === "SEND_EMAIL") return { recipients: [{ type: "all_admins", value: "" }], cc: [], bcc: [], subject: "", body: "" }
  if (type === "SEND_SMS") return { body: "" }
  return {}
}

// ─── Trigger config form ──────────────────────────────────────────────────────

function TriggerConfigFields({
  type, config, onChange, users, tags, practices, locations, pipelines,
}: {
  type: string
  config: Record<string, unknown>
  onChange: (cfg: Record<string, unknown>) => void
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]; pipelines: Pipeline[]
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val })
  const conditions = (config.conditions as Condition[]) ?? []
  const showConditions = REFERRAL_TRIGGERS.has(type)

  function renderPrimary() {
    if (type === "REFERRAL_CREATED" || type === "EMBED_REFERRAL_RECEIVED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter by practice (optional)</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.practiceId as string) || ""} onChange={e => set("practiceId", e.target.value || undefined)}>
              <option value="">Any practice</option>
              {practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter by location (optional)</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.locationId as string) || ""} onChange={e => set("locationId", e.target.value || undefined)}>
              <option value="">Any location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
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

    if (type === "PROVIDER_REFERRAL_COUNT" || type === "PRACTICE_REFERRAL_COUNT" || type === "LOCATION_REFERRAL_COUNT") {
      return (
        <div className="space-y-3">
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
          {type === "LOCATION_REFERRAL_COUNT" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Filter by specific location (optional)</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.locationId as string) || ""} onChange={e => set("locationId", e.target.value || undefined)}>
                <option value="">Any location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </div>
      )
    }

    if (type === "REFERRAL_NO_ACTIVITY") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">No activity for (days)</label>
            <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.days as number) || 7} onChange={e => set("days", Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Only for status (optional)</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.statusFilter as string) || ""} onChange={e => set("statusFilter", e.target.value || undefined)}>
              <option value="">Any open status</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
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

    if (type === "APPOINTMENT_OVERDUE") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Min days overdue (0 = any)</label>
          <input type="number" min={0} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.daysOverdue as number) ?? 0} onChange={e => set("daysOverdue", Number(e.target.value))} />
          <p className="text-xs text-slate-500 mt-1">Fires for referrals still in "Scheduled" after their appointment date.</p>
        </div>
      )
    }

    if (type === "REFERRAL_STALE") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Created this many days ago with no appointment</label>
          <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.days as number) || 14} onChange={e => set("days", Number(e.target.value))} />
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

    if (type === "TAG_ADDED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Filter by specific tag (optional)</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.tagId as string) || ""} onChange={e => set("tagId", e.target.value || undefined)}>
            <option value="">Any tag</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )
    }

    if (type === "PIPELINE_CHANGED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From pipeline (optional)</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.fromPipelineId as string) || ""} onChange={e => set("fromPipelineId", e.target.value || undefined)}>
              <option value="">Any</option>
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To pipeline (optional)</label>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={(config.toPipelineId as string) || ""} onChange={e => set("toPipelineId", e.target.value || undefined)}>
              <option value="">Any</option>
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      )
    }

    if (type === "AUTH_STATUS_CHANGED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Filter by new auth status value (optional)</label>
          <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Approved" value={(config.toAuthStatus as string) || ""} onChange={e => set("toAuthStatus", e.target.value || undefined)} />
        </div>
      )
    }

    // DOCUMENT_UPLOADED — no primary config
    return null
  }

  return (
    <div className="space-y-4">
      {renderPrimary()}
      {showConditions && (
        <div className="border-t pt-3">
          <ConditionsBuilder
            conditions={conditions}
            onChange={c => set("conditions", c)}
            users={users} practices={practices} locations={locations} tags={tags}
          />
        </div>
      )}
    </div>
  )
}

// ─── Shared recipient rows widget ────────────────────────────────────────────

type Recipient = { type: string; value: string | string[] }

function RecipientRows({
  rows, users, onChange, allowEmpty = false,
}: {
  rows: Recipient[]
  users: User[]
  onChange: (next: Recipient[]) => void
  allowEmpty?: boolean
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const selectedIds = Array.isArray(r.value) ? r.value : (r.value ? [r.value as string] : [])
        const toggleUser = (uid: string, checked: boolean) => {
          const next = checked ? [...selectedIds, uid] : selectedIds.filter(id => id !== uid)
          onChange(rows.map((x, j) => j === i ? { ...x, value: next } : x))
        }
        return (
          <div key={i} className="flex items-start gap-2 flex-wrap">
            <select className="border rounded-md px-2 py-1.5 text-sm shrink-0" value={r.type}
              onChange={e => onChange(rows.map((x, j) => j === i ? { type: e.target.value, value: [] } : x))}>
              <option value="all_admins">All admins</option>
              <option value="assigned_to">Referral assignee</option>
              <option value="user">Specific users</option>
              <option value="email">Custom email</option>
            </select>
            {r.type === "user" && (
              <div className="flex-1 border rounded-md overflow-y-auto max-h-36">
                {users.map(u => (
                  <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" className="accent-blue-600" checked={selectedIds.includes(u.id)}
                      onChange={e => toggleUser(u.id, e.target.checked)} />
                    <span className="text-sm text-slate-700">{u.name || u.email}</span>
                  </label>
                ))}
              </div>
            )}
            {r.type === "email" && (
              <input type="email" className="flex-1 border rounded-md px-2 py-1.5 text-sm"
                placeholder="email@example.com" value={r.value as string}
                onChange={e => onChange(rows.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
            )}
            {(allowEmpty || rows.length > 1) && (
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-500 mt-1.5">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Action config form ───────────────────────────────────────────────────────

function ActionConfigFields({
  type, config, onChange, users, tags,
}: {
  type: AutomationAction
  config: Record<string, unknown>
  onChange: (cfg: Record<string, unknown>) => void
  users: User[]
  tags: Tag[]
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val })
  const [showVars, setShowVars] = useState(false)
  const [showBodyVars, setShowBodyVars] = useState(false)
  const [showCc, setShowCc] = useState(() => Array.isArray(config.cc) && (config.cc as unknown[]).length > 0)
  const [showBcc, setShowBcc] = useState(() => Array.isArray(config.bcc) && (config.bcc as unknown[]).length > 0)

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
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
    )
  }

  if ((type as string) === "SEND_SMS") {
    const body = (config.body as string) || ""
    const SMS_LIMIT = 160
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Sends an SMS to the patient's phone number on the referral.</p>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Message *</label>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${body.length > SMS_LIMIT ? "text-red-600" : "text-slate-400"}`}>
                {body.length} / {SMS_LIMIT}
              </span>
              <button type="button" onClick={() => setShowVars(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Info className="h-3 w-3" /> Template vars
              </button>
            </div>
          </div>
          {showVars && (
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARS.map(v => (
                <span key={v} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-slate-200"
                  onClick={() => set("body", body + v)}>{v}</span>
              ))}
            </div>
          )}
          <textarea
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm resize-none"
            placeholder="e.g. Hi {patient_first_name}, your appointment at {practice_name} is coming up. Reply STOP to opt out."
            value={body}
            onChange={e => set("body", e.target.value)}
          />
        </div>
      </div>
    )
  }

  if (type === "SEND_EMAIL") {
    const toRows = (config.recipients as Recipient[]) ?? [{ type: "all_admins", value: "" }]
    const ccRows = (config.cc as Recipient[]) ?? []
    const bccRows = (config.bcc as Recipient[]) ?? []

    return (
      <div className="space-y-3">
        {/* To */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600">To *</label>
            <div className="flex items-center gap-3">
              {!showCc && <button type="button" onClick={() => { setShowCc(true); set("cc", [{ type: "email", value: "" }]) }} className="text-xs text-slate-500 hover:text-blue-600">+ CC</button>}
              {!showBcc && <button type="button" onClick={() => { setShowBcc(true); set("bcc", [{ type: "email", value: "" }]) }} className="text-xs text-slate-500 hover:text-blue-600">+ BCC</button>}
              <button type="button" onClick={() => set("recipients", [...toRows, { type: "all_admins", value: "" }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          </div>
          <RecipientRows rows={toRows} users={users} onChange={next => set("recipients", next)} />
        </div>

        {/* CC */}
        {showCc && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">CC</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => set("cc", [...ccRows, { type: "email", value: "" }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add
                </button>
                <button type="button" onClick={() => { setShowCc(false); set("cc", []) }} className="text-xs text-slate-400 hover:text-red-500">Remove CC</button>
              </div>
            </div>
            <RecipientRows rows={ccRows} users={users} onChange={next => set("cc", next)} allowEmpty />
          </div>
        )}

        {/* BCC */}
        {showBcc && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">BCC</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => set("bcc", [...bccRows, { type: "email", value: "" }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add
                </button>
                <button type="button" onClick={() => { setShowBcc(false); set("bcc", []) }} className="text-xs text-slate-400 hover:text-red-500">Remove BCC</button>
              </div>
            </div>
            <RecipientRows rows={bccRows} users={users} onChange={next => set("bcc", next)} allowEmpty />
          </div>
        )}

        {/* Subject */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Subject *</label>
            <button type="button" onClick={() => setShowVars(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Info className="h-3 w-3" /> Template vars
            </button>
          </div>
          {showVars && (
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARS.map(v => (
                <span key={v} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-slate-200"
                  onClick={() => set("subject", ((config.subject as string) || "") + v)}>{v}</span>
              ))}
            </div>
          )}
          <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. New referral from {practice_name}"
            value={(config.subject as string) || ""} onChange={e => set("subject", e.target.value)} />
        </div>

        {/* Body */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Body *</label>
            <button type="button" onClick={() => setShowBodyVars(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Info className="h-3 w-3" /> Template vars
            </button>
          </div>
          {showBodyVars && (
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATE_VARS.map(v => (
                <span key={v} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-slate-200"
                  onClick={() => set("body", ((config.body as string) || "") + v)}>{v}</span>
              ))}
            </div>
          )}
          <textarea rows={4} className="w-full border rounded-md px-3 py-2 text-sm resize-none"
            placeholder={"e.g. Hi,\n\nA new referral for {patient_name} was received from {practice_name}."}
            value={(config.body as string) || ""} onChange={e => set("body", e.target.value)} />
        </div>
      </div>
    )
  }

  return null
}

// ─── Automation form dialog ───────────────────────────────────────────────────

function AutomationDialog({
  open, onClose, editing, users, tags, practices, locations, pipelines,
}: {
  open: boolean
  onClose: (refresh?: boolean) => void
  editing: Automation | null
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]; pipelines: Pipeline[]
}) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [triggerType, setTriggerType] = useState<string>(editing?.triggerType ?? "REFERRAL_CREATED")
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(editing?.triggerConfig ?? emptyTriggerConfig("REFERRAL_CREATED"))
  const [actionType, setActionType] = useState<AutomationAction>(editing?.actionType ?? "CREATE_TASK")
  const [actionConfig, setActionConfig] = useState<Record<string, unknown>>(editing?.actionConfig ?? emptyActionConfig("CREATE_TASK"))
  const [error, setError] = useState("")

  if (!open) return null

  function handleTriggerChange(t: string) {
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
        await updateAutomation(editing.id, { name: name.trim(), description: description.trim() || undefined, triggerType: triggerType as AutomationTrigger, triggerConfig, actionType, actionConfig, isActive: editing.isActive })
      } else {
        await createAutomation({ name: name.trim(), description: description.trim() || undefined, triggerType: triggerType as AutomationTrigger, triggerConfig, actionType, actionConfig })
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
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Rule name *</label>
              <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Flag overdue appointments" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
              <input className="w-full border rounded-md px-3 py-2 text-sm" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-xs font-bold shrink-0">T</div>
              <h3 className="text-sm font-semibold text-slate-700">TRIGGER — When this happens</h3>
            </div>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={triggerType} onChange={e => handleTriggerChange(e.target.value)}>
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <TriggerConfigFields
              type={triggerType} config={triggerConfig} onChange={setTriggerConfig}
              users={users} tags={tags} practices={practices} locations={locations} pipelines={pipelines}
            />
          </div>

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
  auto, onEdit, onDeleted, onToggled,
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

  const triggerColor = TRIGGER_COLORS[auto.triggerType] ?? "bg-slate-100 text-slate-700"
  const triggerLabel = TRIGGER_LABELS[auto.triggerType] ?? auto.triggerType

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
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", triggerColor)}>
              {triggerLabel}
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
              {Object.keys(auto.triggerConfig).filter(k => k !== "conditions").length === 0 && !(auto.triggerConfig.conditions as unknown[])?.length
                ? <p className="text-slate-400 italic">No filter conditions</p>
                : Object.entries(auto.triggerConfig).map(([k, v]) => {
                  if (k === "conditions") {
                    const conds = v as Condition[]
                    if (!conds?.length) return null
                    return <p key={k}><span className="font-medium">+{conds.length} condition{conds.length !== 1 ? "s" : ""}</span></p>
                  }
                  return v ? <p key={k}><span className="font-medium">{k}:</span> {String(v)}</p> : null
                })}
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

export default function AutomationManager({ automations: initial, users, tags, practices, locations, pipelines = [] }: Props) {
  const router = useRouter()
  const [automations, setAutomations] = useState(initial)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [runPending, startRunTransition] = useTransition()
  const [runMsg, setRunMsg] = useState("")

  useEffect(() => { setAutomations(initial) }, [initial])

  function openCreate() { setEditing(null); setDialogOpen(true) }
  function openEdit(a: Automation) { setEditing(a); setDialogOpen(true) }

  function handleClose(refresh?: boolean) {
    setDialogOpen(false)
    setEditing(null)
    if (refresh) router.refresh()
  }

  function handleDeleted() { router.refresh() }
  function handleToggled() { router.refresh() }

  function handleRunScheduled() {
    setRunMsg("")
    startRunTransition(async () => {
      await runScheduledAutomationsAction()
      setRunMsg("Scheduled checks completed.")
      setTimeout(() => setRunMsg(""), 4000)
    })
  }

  return (
    <div className="space-y-4">
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

      <AutomationDialog key={editing?.id ?? "new"} open={dialogOpen} onClose={handleClose} editing={editing} users={users} tags={tags} practices={practices} locations={locations} pipelines={pipelines} />
    </div>
  )
}
