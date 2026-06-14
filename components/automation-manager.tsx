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
import { Zap, Plus, Trash2, Play, ChevronLeft, Info, X, GitBranch, Flag } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import StyledSelect from "@/components/ui/styled-select"
import { RichTextEditor, tokensFromStrings } from "@/components/rich-text-editor"
import { EmailAttachments, type AttachmentRef } from "@/components/email-attachments"
import {
  type AutomationGraph, type GraphNode, type Slot,
  newNodeId, insertAt, deleteNode, updateNode, pruneUnreachable, legacyToGraph,
} from "@/lib/automation-graph"
import type { Condition as PureCondition, ConditionGroup } from "@/lib/automation-conditions"
import {
  REFERRAL_PROPERTY_DEFS, OPERATORS_BY_TYPE, IMAGING_OPTIONS, SURGERY_STATUS_OPTIONS, customPropertyToDef,
  OBJECT_PROPERTY_DEFS, OBJECT_CUSTOM_ENTITY,
  type PropertyDef, type CustomPropertyInput,
} from "@/lib/automation-properties"

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
  flow: Record<string, unknown> | null
  graph: Record<string, unknown> | null
  createdAt: Date
  createdBy: { name: string | null; email: string }
  _count: { runs: number }
}

// A single action inside a branch list
interface FlowAction { type: AutomationAction; config: Record<string, unknown> }
interface AutomationFlow {
  match: "all" | "any"
  rules: Condition[]
  then: FlowAction[]
  else: FlowAction[]
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
  SURGERY_STATUS_CHANGED: "Surgery case status changed",
  SURGERY_CALL_ATTEMPTS_REACHED: "Surgery call attempts reached (4)",
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

// Actions that act on a specific referral — only offered for referral workflows.
const REFERRAL_ONLY_ACTIONS = new Set(["UPDATE_REFERRAL_STATUS", "ASSIGN_REFERRAL", "ADD_TAG", "SEND_SMS"])

function actionsForObject(objectKey: string): AutomationAction[] {
  const all = Object.keys(ACTION_LABELS) as AutomationAction[]
  return objectKey === "REFERRAL" ? all : all.filter(a => !REFERRAL_ONLY_ACTIONS.has(a))
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
  SURGERY_STATUS_CHANGED: "bg-teal-100 text-teal-700",
  SURGERY_CALL_ATTEMPTS_REACHED: "bg-red-100 text-red-700",
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


// ─── Property-driven criteria groups (AND within, OR between) ─────────────────

interface CriteriaData {
  users: User[]; practices: Practice[]; locations: Location[]; tags: Tag[]
  pipelines: Pipeline[]; customDefs: PropertyDef[]; propDefs: PropertyDef[]
}

// Convert legacy flat rules → a single group (for editing older automations).
function rulesToGroups(groups?: ConditionGroup[] | null, legacyRules?: PureCondition[] | null): ConditionGroup[] {
  if (groups && groups.length) return groups
  if (legacyRules && legacyRules.length) return [{ id: newNodeId(), conditions: legacyRules }]
  return []
}

function optionsForProp(def: PropertyDef, data: CriteriaData): { value: string; label: string }[] {
  if (def.type === "tag") return data.tags.map(t => ({ value: t.id, label: t.name }))
  switch (def.source) {
    case "status": return STATUS_OPTIONS
    case "practice": return data.practices.map(p => ({ value: p.id, label: p.name }))
    case "location": return data.locations.map(l => ({ value: l.id, label: l.name }))
    case "user": return data.users.map(u => ({ value: u.id, label: u.name || u.email }))
    case "pipeline": return data.pipelines.map(p => ({ value: p.id, label: p.name }))
    case "imaging": return IMAGING_OPTIONS
    default: return def.options ?? []
  }
}

function CriteriaValueInput({ def, cond, onChange, data }: {
  def: PropertyDef; cond: PureCondition; onChange: (v: string) => void; data: CriteriaData
}) {
  const opDef = OPERATORS_BY_TYPE[def.type].find(o => o.value === cond.op)
  if (opDef?.noValue) return null

  if (def.type === "tag" || def.type === "select") {
    const opts = optionsForProp(def, data)
    return (
      <StyledSelect className="flex-1 min-w-[140px]" value={cond.value} onChange={e => onChange(e.target.value)}>
        <option value="">Select…</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </StyledSelect>
    )
  }
  if (def.type === "number") {
    return <input type="number" className="flex-1 min-w-[120px] border rounded-md px-2 py-1.5 text-sm" placeholder="Value" value={cond.value} onChange={e => onChange(e.target.value)} />
  }
  if (def.type === "date") {
    if (cond.op === "days_ago_lt" || cond.op === "days_ago_gt") {
      return <input type="number" min={0} className="flex-1 min-w-[120px] border rounded-md px-2 py-1.5 text-sm" placeholder="Number of days" value={cond.value} onChange={e => onChange(e.target.value)} />
    }
    return <input type="date" className="flex-1 min-w-[140px] border rounded-md px-2 py-1.5 text-sm" value={cond.value ? cond.value.slice(0, 10) : ""} onChange={e => onChange(e.target.value)} />
  }
  return <input className="flex-1 min-w-[140px] border rounded-md px-2 py-1.5 text-sm" placeholder="Value…" value={cond.value} onChange={e => onChange(e.target.value)} />
}

function CriteriaGroupsBuilder({ groups, onChange, data }: {
  groups: ConditionGroup[]; onChange: (g: ConditionGroup[]) => void; data: CriteriaData
}) {
  const baseProps = data.propDefs.length ? data.propDefs : REFERRAL_PROPERTY_DEFS
  const allProps = [...baseProps, ...data.customDefs]
  const propById = (id: string) => allProps.find(p => p.id === id) ?? baseProps[0]

  function newCondition(): PureCondition {
    const p = baseProps[0]
    return { field: p.id, path: p.path, type: p.type, op: OPERATORS_BY_TYPE[p.type][0].value, value: "" }
  }

  function updateGroup(gid: string, conditions: PureCondition[]) {
    onChange(groups.map(g => g.id === gid ? { ...g, conditions } : g))
  }
  function addGroup() {
    onChange([...groups, { id: newNodeId(), conditions: [newCondition()] }])
  }
  function removeGroup(gid: string) {
    onChange(groups.filter(g => g.id !== gid))
  }
  function setCond(gid: string, idx: number, patch: Partial<PureCondition>) {
    const g = groups.find(x => x.id === gid)
    if (!g) return
    updateGroup(gid, g.conditions.map((c, i) => {
      if (i !== idx) return c
      const next = { ...c, ...patch }
      if (patch.field && patch.field !== c.field) {
        const p = propById(patch.field)
        next.path = p.path
        next.type = p.type
        next.op = OPERATORS_BY_TYPE[p.type][0].value
        next.value = ""
      }
      return next
    }))
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400 italic">No criteria — runs for all records.</p>
        <button type="button" onClick={addGroup}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white hover:bg-zinc-800">
          <Plus className="h-3.5 w-3.5" /> Add criteria
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {groups.map((group, gi) => (
        <div key={group.id}>
          {gi > 0 && (
            <div className="flex items-center gap-2 my-1.5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          )}
          <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Group {gi + 1}</span>
              <button type="button" onClick={() => removeGroup(group.id)} className="text-slate-300 hover:text-red-500" title="Remove group">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {group.conditions.map((cond, ci) => {
              const def = propById(cond.field)
              return (
                <div key={ci}>
                  {ci > 0 && <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block my-1">and</span>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StyledSelect className="shrink-0 min-w-[150px]" value={cond.field} onChange={e => setCond(group.id, ci, { field: e.target.value })}>
                      {baseProps.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      {data.customDefs.length > 0 && <option disabled>──────────</option>}
                      {data.customDefs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </StyledSelect>
                    <StyledSelect className="shrink-0 min-w-[130px]" value={cond.op} onChange={e => setCond(group.id, ci, { op: e.target.value, value: "" })}>
                      {OPERATORS_BY_TYPE[def.type].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </StyledSelect>
                    <CriteriaValueInput def={def} cond={cond} onChange={v => setCond(group.id, ci, { value: v })} data={data} />
                    <button type="button" onClick={() => updateGroup(group.id, group.conditions.filter((_, i) => i !== ci))}
                      className="text-slate-400 hover:text-red-500 shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
            <button type="button" onClick={() => updateGroup(group.id, [...group.conditions, newCondition()])}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add criteria
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addGroup}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
        <Plus className="h-3.5 w-3.5" /> Add group <span className="text-slate-400">(OR)</span>
      </button>
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
  if (type === "SURGERY_STATUS_CHANGED") return { fromStatus: "", toStatus: "", conditionGroups: [] }
  if (type === "SURGERY_CALL_ATTEMPTS_REACHED") return { count: 4, conditionGroups: [] }
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
  type, config, onChange, users, tags, practices, locations, pipelines, customDefs, propDefs,
}: {
  type: string
  config: Record<string, unknown>
  onChange: (cfg: Record<string, unknown>) => void
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]; pipelines: Pipeline[]
  customDefs: PropertyDef[]; propDefs: PropertyDef[]
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val })
  // Every object supports enrollment criteria now.
  const showConditions = true
  const criteriaData: CriteriaData = { users, practices, locations, tags, pipelines, customDefs, propDefs }

  // Migrate legacy flat conditions → a single group, once, when editing older rules.
  useEffect(() => {
    if (!config.conditionGroups && Array.isArray(config.conditions) && (config.conditions as unknown[]).length) {
      set("conditionGroups", [{ id: newNodeId(), conditions: config.conditions }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function renderPrimary() {
    if (type === "REFERRAL_CREATED" || type === "EMBED_REFERRAL_RECEIVED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter by practice (optional)</label>
            <StyledSelect className="w-full" value={(config.practiceId as string) || ""} onChange={e => set("practiceId", e.target.value || undefined)}>
              <option value="">Any practice</option>
              {practices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Filter by location (optional)</label>
            <StyledSelect className="w-full" value={(config.locationId as string) || ""} onChange={e => set("locationId", e.target.value || undefined)}>
              <option value="">Any location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </StyledSelect>
          </div>
        </div>
      )
    }

    if (type === "REFERRAL_STATUS_CHANGED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From status (optional)</label>
            <StyledSelect className="w-full" value={(config.fromStatus as string) || ""} onChange={e => set("fromStatus", e.target.value || undefined)}>
              <option value="">Any</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To status (optional)</label>
            <StyledSelect className="w-full" value={(config.toStatus as string) || ""} onChange={e => set("toStatus", e.target.value || undefined)}>
              <option value="">Any</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </StyledSelect>
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
              <StyledSelect className="w-full" value={(config.period as string) || "month"} onChange={e => set("period", e.target.value)}>
                {PERIOD_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </StyledSelect>
            </div>
          </div>
          {type === "LOCATION_REFERRAL_COUNT" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Filter by specific location (optional)</label>
              <StyledSelect className="w-full" value={(config.locationId as string) || ""} onChange={e => set("locationId", e.target.value || undefined)}>
                <option value="">Any location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </StyledSelect>
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
            <StyledSelect className="w-full" value={(config.statusFilter as string) || ""} onChange={e => set("statusFilter", e.target.value || undefined)}>
              <option value="">Any open status</option>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </StyledSelect>
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
          <StyledSelect className="w-full" value={(config.count as number) || 3} onChange={e => set("count", Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </StyledSelect>
        </div>
      )
    }

    if (type === "REFERRAL_ASSIGNED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Filter by assignee (optional)</label>
          <StyledSelect className="w-full" value={(config.assignedToId as string) || ""} onChange={e => set("assignedToId", e.target.value || undefined)}>
            <option value="">Any user</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </StyledSelect>
        </div>
      )
    }

    if (type === "TAG_ADDED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Filter by specific tag (optional)</label>
          <StyledSelect className="w-full" value={(config.tagId as string) || ""} onChange={e => set("tagId", e.target.value || undefined)}>
            <option value="">Any tag</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </StyledSelect>
        </div>
      )
    }

    if (type === "PIPELINE_CHANGED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From pipeline (optional)</label>
            <StyledSelect className="w-full" value={(config.fromPipelineId as string) || ""} onChange={e => set("fromPipelineId", e.target.value || undefined)}>
              <option value="">Any</option>
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To pipeline (optional)</label>
            <StyledSelect className="w-full" value={(config.toPipelineId as string) || ""} onChange={e => set("toPipelineId", e.target.value || undefined)}>
              <option value="">Any</option>
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </StyledSelect>
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

    if (type === "SURGERY_STATUS_CHANGED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From status (optional)</label>
            <StyledSelect className="w-full" value={(config.fromStatus as string) || ""} onChange={e => set("fromStatus", e.target.value || undefined)}>
              <option value="">Any</option>
              {SURGERY_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To status (optional)</label>
            <StyledSelect className="w-full" value={(config.toStatus as string) || ""} onChange={e => set("toStatus", e.target.value || undefined)}>
              <option value="">Any</option>
              {SURGERY_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </StyledSelect>
          </div>
        </div>
      )
    }

    if (type === "SURGERY_CALL_ATTEMPTS_REACHED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Number of call attempts</label>
          <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" value={(config.count as number) || 4} onChange={e => set("count", Number(e.target.value))} />
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
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Only enroll records that meet these conditions</p>
          <CriteriaGroupsBuilder
            groups={(config.conditionGroups as ConditionGroup[]) ?? []}
            onChange={g => set("conditionGroups", g)}
            data={criteriaData}
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
            <StyledSelect className="shrink-0" value={r.type}
              onChange={e => onChange(rows.map((x, j) => j === i ? { type: e.target.value, value: [] } : x))}>
              <option value="all_admins">All admins</option>
              <option value="assigned_to">Referral assignee</option>
              <option value="user">Specific users</option>
              <option value="email">Custom email</option>
            </StyledSelect>
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
            <StyledSelect className="w-full" value={(config.priority as string) || "NORMAL"} onChange={e => set("priority", e.target.value)}>
              {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due in (days, optional)</label>
            <input type="number" min={1} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. 3" value={(config.dueDaysFromNow as string) || ""} onChange={e => set("dueDaysFromNow", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Assign task to</label>
          <StyledSelect className="w-full" value={(config.assignedToId as string) || ""} onChange={e => set("assignedToId", e.target.value)}>
            <option value="">Unassigned</option>
            <option value="assigned_to">Referral assignee</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </StyledSelect>
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
          <StyledSelect className="w-full" value={(config.userId as string) || ""} onChange={e => set("userId", e.target.value)}>
            <option value="">Select recipient</option>
            <option value="all_admins">All admins</option>
            <option value="assigned_to">Referral assignee</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </StyledSelect>
        </div>
      </div>
    )
  }

  if (type === "UPDATE_REFERRAL_STATUS") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">New status *</label>
        <StyledSelect className="w-full" value={(config.status as string) || ""} onChange={e => set("status", e.target.value)}>
          <option value="">Select status</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </StyledSelect>
      </div>
    )
  }

  if (type === "ASSIGN_REFERRAL") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Assign to *</label>
        <StyledSelect className="w-full" value={(config.userId as string) || ""} onChange={e => set("userId", e.target.value)}>
          <option value="">Select user</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </StyledSelect>
      </div>
    )
  }

  if (type === "ADD_TAG") {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Tag *</label>
        <StyledSelect className="w-full" value={(config.tagId as string) || ""} onChange={e => set("tagId", e.target.value)}>
          <option value="">Select tag</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </StyledSelect>
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
        {/* From */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="text-xs font-semibold text-blue-700 block mb-1.5">From (sender email)</label>
          <StyledSelect value={(config.sender as string) || "referrals"} onChange={e => set("sender", e.target.value)}
            className="w-full">
            <option value="referrals">Referrals@genesisortho.com</option>
            <option value="surgery">surgery@genesisortho.com</option>
            <option value="tpl">tpl@genesisortho.com</option>
          </StyledSelect>
        </div>

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
          <RichTextEditor
            value={(config.body as string) || ""}
            onChange={html => set("body", html)}
            minHeight={140}
            placeholder="e.g. Hi, A new referral for {patient_name} was received from {practice_name}."
            tokens={tokensFromStrings(TEMPLATE_VARS)}
          />
        </div>

        {/* Attachments */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1.5">Attachments</label>
          <EmailAttachments
            value={(config.attachments as AttachmentRef[]) ?? []}
            onChange={next => set("attachments", next)}
            compact
          />
        </div>
      </div>
    )
  }

  return null
}

// ─── Ordered list of actions (used by each branch of an if/else flow) ──────────

function ActionList({ actions, onChange, users, tags, emptyLabel }: {
  actions: FlowAction[]
  onChange: (next: FlowAction[]) => void
  users: User[]; tags: Tag[]
  emptyLabel: string
}) {
  function add() {
    onChange([...actions, { type: "CREATE_TASK", config: emptyActionConfig("CREATE_TASK") }])
  }
  function removeAt(i: number) {
    onChange(actions.filter((_, idx) => idx !== i))
  }
  function setType(i: number, type: AutomationAction) {
    onChange(actions.map((a, idx) => idx === i ? { type, config: emptyActionConfig(type) } : a))
  }
  function setConfig(i: number, config: Record<string, unknown>) {
    onChange(actions.map((a, idx) => idx === i ? { ...a, config } : a))
  }

  return (
    <div className="space-y-2">
      {actions.length === 0 && (
        <p className="text-xs text-slate-400 italic">{emptyLabel}</p>
      )}
      {actions.map((a, i) => (
        <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 w-4 shrink-0">{i + 1}</span>
            <StyledSelect
              className="flex-1"
              value={a.type}
              onChange={e => setType(i, e.target.value as AutomationAction)}
            >
              {(Object.keys(ACTION_LABELS) as AutomationAction[]).map(t => (
                <option key={t} value={t}>{ACTION_LABELS[t]}</option>
              ))}
            </StyledSelect>
            <button type="button" onClick={() => removeAt(i)} className="text-slate-400 hover:text-red-500 shrink-0" title="Remove action">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <ActionConfigFields type={a.type} config={a.config} onChange={cfg => setConfig(i, cfg)} users={users} tags={tags} />
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
        <Plus className="h-3 w-3" /> Add action
      </button>
    </div>
  )
}

// ─── Visual flow canvas ───────────────────────────────────────────────────────

function actionSummary(type: AutomationAction, config: Record<string, unknown>): string {
  if (type === "CREATE_TASK" && config.title) return `Create task: ${config.title}`
  if (type === "SEND_EMAIL" && config.subject) return `Send email: ${config.subject}`
  if (type === "SEND_SMS") return "Send SMS"
  if (type === "ADD_TAG") return "Add tag"
  if (type === "UPDATE_REFERRAL_STATUS" && config.status) return `Set status: ${config.status}`
  if (type === "ASSIGN_REFERRAL") return "Assign referral"
  if (type === "SEND_NOTIFICATION") return "Send notification"
  return ACTION_LABELS[type] ?? type
}

// vertical connector line
function Connector() {
  return <div className="flex justify-center"><div className="w-px h-5 bg-slate-300" /></div>
}

// "+" insert control with a small action/branch menu
function InsertButton({ onAddAction, onAddBranch, onAddMulti }: { onAddAction: () => void; onAddBranch: () => void; onAddMulti: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex justify-center relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-6 h-6 rounded-full border border-slate-300 bg-white text-slate-400 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center shadow-sm">
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
          <div className="absolute top-7 z-50 bg-white border border-slate-200 rounded-lg shadow-xl py-1 w-44">
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddAction() }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-blue-500" /> Action
            </button>
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddBranch() }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-violet-500" /> If / Else
            </button>
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddMulti() }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-fuchsia-500 rotate-90" /> Branches
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function FlowCanvas({ graph, onChange, onEditNode }: {
  graph: AutomationGraph
  onChange: (g: AutomationGraph) => void
  onEditNode: (id: string) => void
}) {
  function addAction(slot: Slot) {
    const id = newNodeId()
    onChange(insertAt(graph, slot, { id, kind: "action", actionType: "CREATE_TASK", config: emptyActionConfig("CREATE_TASK"), next: null }))
    onEditNode(id)
  }
  function addBranch(slot: Slot) {
    const id = newNodeId()
    onChange(insertAt(graph, slot, { id, kind: "branch", match: "all", rules: [], thenNext: null, elseNext: null }))
    onEditNode(id)
  }
  function addMulti(slot: Slot) {
    const id = newNodeId()
    onChange(insertAt(graph, slot, {
      id, kind: "multi",
      arms: [
        { id: newNodeId(), label: "Branch 1", match: "all", rules: [], next: null },
        { id: newNodeId(), label: "Branch 2", match: "all", rules: [], next: null },
      ],
      elseNext: null,
    }))
    onEditNode(id)
  }

  function renderSlot(slot: Slot, depth = 0): React.ReactNode {
    if (depth > 50) return null // safety
    const slotNode = slot.kind === "root" ? null : graph.nodes[slot.nodeId]
    const startId: string | null | undefined =
      slot.kind === "root" ? graph.rootId
      : slot.kind === "after" ? (slotNode as any)?.next
      : slot.kind === "then" ? (slotNode as any)?.thenNext
      : slot.kind === "arm" ? (slotNode as any)?.arms?.find((a: any) => a.id === slot.armId)?.next
      : (slotNode as any)?.elseNext

    const insert = <InsertButton onAddAction={() => addAction(slot)} onAddBranch={() => addBranch(slot)} onAddMulti={() => addMulti(slot)} />

    if (!startId || !graph.nodes[startId]) {
      return (
        <div className="flex flex-col items-center">
          {insert}
          <Connector />
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-400 text-xs font-medium">
            <Flag className="h-3 w-3" /> End
          </div>
        </div>
      )
    }

    const node = graph.nodes[startId]
    return (
      <div className="flex flex-col items-center">
        {insert}
        <Connector />
        {node.kind === "action" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              color="blue" icon={<Zap className="h-3.5 w-3.5" />} title={actionSummary(node.actionType as AutomationAction, node.config)} />
            {renderSlot({ kind: "after", nodeId: node.id }, depth + 1)}
          </>
        ) : node.kind === "branch" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              color="violet" icon={<GitBranch className="h-3.5 w-3.5" />}
              title={`If ${node.rules.length} condition${node.rules.length === 1 ? "" : "s"} (match ${node.match})`} />
            <Connector />
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Then</span>
                {renderSlot({ kind: "then", nodeId: node.id }, depth + 1)}
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Else</span>
                {renderSlot({ kind: "else", nodeId: node.id }, depth + 1)}
              </div>
            </div>
          </>
        ) : (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              color="violet" icon={<GitBranch className="h-3.5 w-3.5 rotate-90" />}
              title={`${node.arms.length} branch${node.arms.length === 1 ? "" : "es"}`} />
            <Connector />
            <div className="flex gap-6 items-start">
              {node.arms.map(arm => (
                <div key={arm.id} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-fuchsia-600 uppercase tracking-wide max-w-[120px] truncate" title={arm.label}>
                    {arm.label}
                  </span>
                  {renderSlot({ kind: "arm", nodeId: node.id, armId: arm.id }, depth + 1)}
                </div>
              ))}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Else</span>
                {renderSlot({ kind: "else", nodeId: node.id }, depth + 1)}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto py-2">
      <div className="flex flex-col items-center min-w-fit">
        {/* connector down from the trigger card above */}
        <div className="w-px h-5 bg-slate-300" />
        {renderSlot({ kind: "root" })}
      </div>
    </div>
  )
}

function NodeChip({ title, icon, color, onClick, onDelete }: {
  title: string; icon: React.ReactNode; color: "blue" | "violet"
  onClick: () => void; onDelete: () => void
}) {
  return (
    <div className={cn(
      "group relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white shadow-sm cursor-pointer hover:shadow transition-shadow min-w-[180px] max-w-[260px]",
      color === "blue" ? "border-blue-200" : "border-violet-200"
    )} onClick={onClick}>
      <span className={cn("shrink-0", color === "blue" ? "text-blue-500" : "text-violet-500")}>{icon}</span>
      <span className="text-sm text-slate-700 truncate flex-1">{title}</span>
      <button type="button" onClick={e => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 shrink-0 transition-opacity">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function NodeEditModal({ node, onSave, onClose, users, tags, practices, locations, pipelines, customDefs, propDefs, actions }: {
  node: GraphNode
  onSave: (n: GraphNode) => void
  onClose: () => void
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]
  pipelines: Pipeline[]; customDefs: PropertyDef[]; propDefs: PropertyDef[]; actions: AutomationAction[]
}) {
  const [draft, setDraft] = useState<GraphNode>(node)
  const criteriaData: CriteriaData = { users, practices, locations, tags, pipelines, customDefs, propDefs }

  function updateArm(armId: string, patch: Partial<import("@/lib/automation-graph").BranchArm>) {
    if (draft.kind !== "multi") return
    setDraft({ ...draft, arms: draft.arms.map(a => a.id === armId ? { ...a, ...patch } : a) })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold text-slate-800">
            {draft.kind === "branch" ? "Edit branch (if/else)" : draft.kind === "multi" ? "Edit branches" : "Edit action"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {draft.kind === "action" ? (
            <>
              <StyledSelect className="w-full"
                value={draft.actionType}
                onChange={e => { const t = e.target.value as AutomationAction; setDraft({ ...draft, actionType: t, config: emptyActionConfig(t) }) }}>
                {actions.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
              </StyledSelect>
              <ActionConfigFields type={draft.actionType as AutomationAction} config={draft.config}
                onChange={cfg => setDraft({ ...draft, config: cfg })} users={users} tags={tags} />
            </>
          ) : draft.kind === "branch" ? (
            <>
              <p className="text-xs text-slate-500">Records take the <span className="font-medium">Then</span> path when they meet these conditions; otherwise the <span className="font-medium">Else</span> path.</p>
              <CriteriaGroupsBuilder
                groups={rulesToGroups(draft.groups, draft.rules)}
                onChange={groups => setDraft({ ...draft, groups })}
                data={criteriaData}
              />
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Records go down the <span className="font-medium">first branch</span> whose conditions match; if none match they go down the Else path.
              </p>
              {draft.arms.map((arm, i) => (
                <div key={arm.id} className="border border-fuchsia-200 rounded-lg p-3 space-y-2.5 bg-fuchsia-50/30">
                  <div className="flex items-center gap-2">
                    <input
                      value={arm.label}
                      onChange={e => updateArm(arm.id, { label: e.target.value })}
                      placeholder={`Branch ${i + 1}`}
                      className="flex-1 border border-slate-200 rounded-md px-2 py-1.5 text-sm font-medium bg-white focus:outline-none focus:border-slate-400"
                    />
                    {draft.arms.length > 1 && (
                      <button type="button"
                        onClick={() => setDraft({ ...draft, arms: draft.arms.filter(a => a.id !== arm.id) })}
                        className="text-slate-300 hover:text-red-500 shrink-0" title="Remove branch">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <CriteriaGroupsBuilder
                    groups={rulesToGroups(arm.groups, arm.rules)}
                    onChange={groups => updateArm(arm.id, { groups })}
                    data={criteriaData}
                  />
                </div>
              ))}
              <button type="button"
                onClick={() => setDraft({ ...draft, arms: [...draft.arms, { id: newNodeId(), label: `Branch ${draft.arms.length + 1}`, match: "all", rules: [], next: null }] })}
                className="flex items-center gap-1.5 text-sm text-fuchsia-600 hover:text-fuchsia-700 font-medium">
                <Plus className="h-3.5 w-3.5" /> Add branch
              </button>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={() => onSave(draft)} className="px-3 py-1.5 text-sm bg-zinc-900 text-white rounded-md hover:bg-zinc-800">Done</button>
        </div>
      </div>
    </div>
  )
}

// ─── Workflow object grouping ─────────────────────────────────────────────────

export const WORKFLOW_OBJECTS: { key: string; label: string; triggers: string[] }[] = [
  {
    key: "REFERRAL",
    label: "Referral",
    triggers: [
      "REFERRAL_CREATED", "REFERRAL_STATUS_CHANGED", "REFERRAL_ASSIGNED", "REFERRAL_NO_ACTIVITY",
      "APPOINTMENT_UPCOMING", "APPOINTMENT_OVERDUE", "REFERRAL_STALE", "CALL_ATTEMPTS_REACHED",
      "TAG_ADDED", "DOCUMENT_UPLOADED", "AUTH_STATUS_CHANGED", "EMBED_REFERRAL_RECEIVED", "PIPELINE_CHANGED",
    ],
  },
  { key: "PROVIDER", label: "Provider",     triggers: ["PROVIDER_REFERRAL_COUNT"] },
  { key: "PRACTICE", label: "Practice",     triggers: ["PRACTICE_REFERRAL_COUNT"] },
  { key: "LOCATION", label: "Location",     triggers: ["LOCATION_REFERRAL_COUNT"] },
  { key: "SURGERY",  label: "Surgery Case", triggers: ["SURGERY_STATUS_CHANGED", "SURGERY_CALL_ATTEMPTS_REACHED"] },
]

export function workflowObjectFor(trigger: string): { key: string; label: string } {
  const obj = WORKFLOW_OBJECTS.find(o => o.triggers.includes(trigger))
  return obj ? { key: obj.key, label: obj.label } : { key: "REFERRAL", label: "Referral" }
}

const OBJECT_BADGE_COLORS: Record<string, string> = {
  REFERRAL: "bg-blue-50 text-blue-700 border-blue-200",
  PROVIDER: "bg-teal-50 text-teal-700 border-teal-200",
  PRACTICE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  LOCATION: "bg-violet-50 text-violet-700 border-violet-200",
  SURGERY:  "bg-rose-50 text-rose-700 border-rose-200",
}

// ─── Full-page workflow editor (HubSpot-style) ───────────────────────────────

export function WorkflowEditor({ editing, users, tags, practices, locations, pipelines = [], customPropsByEntity = {} }: {
  editing: Automation | null
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]; pipelines?: Pipeline[]
  customPropsByEntity?: Record<string, CustomPropertyInput[]>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [objectKey, setObjectKey] = useState(workflowObjectFor(editing?.triggerType ?? "REFERRAL_CREATED").key)
  const [triggerType, setTriggerType] = useState<string>(editing?.triggerType ?? "REFERRAL_CREATED")
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>(editing?.triggerConfig ?? emptyTriggerConfig("REFERRAL_CREATED"))
  const editingFlow = (editing?.flow ?? null) as AutomationFlow | null
  const editingGraph = (editing?.graph ?? null) as AutomationGraph | null
  const [graph, setGraph] = useState<AutomationGraph>(
    editingGraph?.rootId
      ? editingGraph
      : editing
        ? legacyToGraph({ actionType: editing.actionType, actionConfig: editing.actionConfig, flow: editingFlow })
        : { rootId: null, nodes: {} }
  )
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const objectDef = WORKFLOW_OBJECTS.find(o => o.key === objectKey) ?? WORKFLOW_OBJECTS[0]
  const propDefs = OBJECT_PROPERTY_DEFS[objectKey] ?? REFERRAL_PROPERTY_DEFS
  const objectEntity = OBJECT_CUSTOM_ENTITY[objectKey]
  const customDefs = (objectEntity ? customPropsByEntity[objectEntity] ?? [] : []).map(customPropertyToDef)
  const objectActions = actionsForObject(objectKey)

  function handleObjectChange(key: string) {
    setObjectKey(key)
    const first = (WORKFLOW_OBJECTS.find(o => o.key === key) ?? WORKFLOW_OBJECTS[0]).triggers[0]
    setTriggerType(first)
    setTriggerConfig(emptyTriggerConfig(first))
  }

  function handleTriggerChange(t: string) {
    setTriggerType(t)
    setTriggerConfig(emptyTriggerConfig(t))
  }

  function handleSave() {
    if (!name.trim()) { setError("Workflow name is required"); return }
    if (!graph.rootId) { setError("Add at least one action to the workflow"); return }
    setError("")
    const firstNode = graph.rootId ? graph.nodes[graph.rootId] : null
    const effectiveActionType = (firstNode && firstNode.kind === "action" ? firstNode.actionType : "CREATE_TASK") as AutomationAction
    startTransition(async () => {
      if (editing) {
        await updateAutomation(editing.id, {
          name: name.trim(), description: description.trim() || undefined,
          triggerType: triggerType as AutomationTrigger, triggerConfig,
          actionType: effectiveActionType, actionConfig: {},
          flow: null, graph: graph as unknown as Record<string, unknown>,
          isActive: editing.isActive,
        })
      } else {
        await createAutomation({
          name: name.trim(), description: description.trim() || undefined,
          triggerType: triggerType as AutomationTrigger, triggerConfig,
          actionType: effectiveActionType, actionConfig: {},
          flow: null, graph: graph as unknown as Record<string, unknown>,
        })
      }
      router.push("/automations")
      router.refresh()
    })
  }

  const editingNode = editingNodeId ? graph.nodes[editingNodeId] : null

  return (
    <div className="min-h-full flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-slate-900 text-white px-5 py-3 flex items-center gap-4 shrink-0">
        <Link href="/automations" className="flex items-center gap-1 text-sm text-slate-300 hover:text-white transition-colors shrink-0">
          <ChevronLeft className="h-4 w-4" /> Workflows
        </Link>
        <div className="w-px h-5 bg-slate-700 shrink-0" />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Untitled workflow"
          className="flex-1 min-w-0 bg-transparent text-base font-semibold placeholder:text-slate-500 outline-none border-b border-transparent focus:border-slate-500 transition-colors"
        />
        {editing && (
          <span className={cn(
            "flex items-center gap-1.5 text-xs font-semibold shrink-0",
            editing.isActive ? "text-emerald-400" : "text-slate-400"
          )}>
            <span className={cn("w-2 h-2 rounded-full", editing.isActive ? "bg-emerald-400" : "bg-slate-500")} />
            {editing.isActive ? "ON" : "OFF"}
          </span>
        )}
        <button onClick={() => router.push("/automations")}
          className="px-3 py-1.5 text-sm text-slate-300 hover:text-white transition-colors shrink-0">
          Cancel
        </button>
        <button onClick={handleSave} disabled={isPending}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shrink-0">
          {isPending ? "Saving…" : editing ? "Save" : "Create workflow"}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 bg-slate-50">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add a description (optional)"
            className="w-full mb-6 bg-transparent text-sm text-slate-600 placeholder:text-slate-400 outline-none border-b border-transparent focus:border-slate-300 transition-colors text-center"
          />

          {/* Trigger node */}
          <div className="bg-white border-2 border-slate-200 rounded-xl shadow-sm">
            <div className="px-5 py-3 border-b bg-amber-50/60 rounded-t-[10px] flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">Trigger — workflow enrollment</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Runs on object</label>
                <StyledSelect className="w-full" value={objectKey} onChange={e => handleObjectChange(e.target.value)}>
                  {WORKFLOW_OBJECTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </StyledSelect>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">When this happens</label>
                <StyledSelect className="w-full" value={triggerType} onChange={e => handleTriggerChange(e.target.value)}>
                  {objectDef.triggers.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t] ?? t}</option>)}
                </StyledSelect>
              </div>
              <TriggerConfigFields
                type={triggerType} config={triggerConfig} onChange={setTriggerConfig}
                users={users} tags={tags} practices={practices} locations={locations} pipelines={pipelines}
                customDefs={customDefs} propDefs={propDefs}
              />
            </div>
          </div>

          {/* Action flow */}
          <FlowCanvas graph={graph} onChange={setGraph} onEditNode={setEditingNodeId} />

          {error && <p className="text-sm text-red-500 mt-4 text-center">{error}</p>}
        </div>
      </div>

      {editingNode && (
        <NodeEditModal
          node={editingNode}
          onClose={() => setEditingNodeId(null)}
          onSave={(n) => { setGraph(pruneUnreachable(updateNode(graph, n))); setEditingNodeId(null) }}
          users={users} tags={tags} practices={practices} locations={locations}
          pipelines={pipelines} customDefs={customDefs} propDefs={propDefs} actions={objectActions}
        />
      )}
    </div>
  )
}

// ─── Workflow list row ────────────────────────────────────────────────────────

function WorkflowTableRow({ auto }: { auto: Automation }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    startTransition(async () => {
      await toggleAutomation(auto.id, !auto.isActive)
      router.refresh()
    })
  }

  function handleDelete() {
    if (!confirm(`Delete workflow "${auto.name}"? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteAutomation(auto.id)
      router.refresh()
    })
  }

  const obj = workflowObjectFor(auto.triggerType)

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/automations/${auto.id}`} className="font-medium text-blue-600 hover:underline text-sm">
          {auto.name}
        </Link>
      </td>
      <td className="px-4 py-3">
        <button onClick={handleToggle} disabled={isPending}
          className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
          title={auto.isActive ? "Turn off" : "Turn on"}>
          <span className={cn("w-2 h-2 rounded-full", auto.isActive ? "bg-emerald-500" : "bg-slate-300")} />
          <span className={auto.isActive ? "text-emerald-700" : "text-slate-400"}>{auto.isActive ? "On" : "Off"}</span>
        </button>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 max-w-[260px] truncate">{auto.description || "—"}</td>
      <td className="px-4 py-3">
        <span className={cn("text-xs px-2 py-0.5 rounded-md font-medium border", OBJECT_BADGE_COLORS[obj.key] ?? "bg-slate-50 text-slate-600 border-slate-200")}>
          {obj.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", TRIGGER_COLORS[auto.triggerType] ?? "bg-slate-100 text-slate-700")}>
          {TRIGGER_LABELS[auto.triggerType] ?? auto.triggerType}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 text-right">{auto._count.runs}</td>
      <td className="px-4 py-3 text-right">
        <button onClick={handleDelete} disabled={isPending}
          className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ─── Main component: workflows list ──────────────────────────────────────────

export default function AutomationManager({ automations }: { automations: Automation[] }) {
  const [search, setSearch] = useState("")
  const [objectFilter, setObjectFilter] = useState("")
  const [runPending, startRunTransition] = useTransition()
  const [runMsg, setRunMsg] = useState("")

  function handleRunScheduled() {
    setRunMsg("")
    startRunTransition(async () => {
      await runScheduledAutomationsAction()
      setRunMsg("Scheduled checks completed.")
      setTimeout(() => setRunMsg(""), 4000)
    })
  }

  const q = search.toLowerCase().trim()
  const rows = automations.filter(a => {
    if (objectFilter && workflowObjectFor(a.triggerType).key !== objectFilter) return false
    if (q && !a.name.toLowerCase().includes(q) && !(a.description ?? "").toLowerCase().includes(q)) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search workflows..."
          className="w-64 border border-slate-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-slate-400"
        />
        <StyledSelect className="w-44" value={objectFilter} onChange={e => setObjectFilter(e.target.value)}>
          <option value="">All object types</option>
          {WORKFLOW_OBJECTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </StyledSelect>
        <button
          onClick={handleRunScheduled}
          disabled={runPending}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors"
        >
          <Play className="h-3.5 w-3.5" />
          {runPending ? "Running…" : "Run scheduled checks"}
        </button>
        {runMsg && <span className="text-xs text-green-600">{runMsg}</span>}
        <Link
          href="/automations/new"
          className="ml-auto flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create workflow
        </Link>
      </div>

      {automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-xl">
          <Zap className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No workflows yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Create workflows to automatically create tasks, send notifications, update statuses, and more based on events.
          </p>
          <Link href="/automations/new" className="mt-4 flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" /> Create your first workflow
          </Link>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                  <th className="px-4 py-2.5 font-semibold">Object type</th>
                  <th className="px-4 py-2.5 font-semibold">Trigger</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Runs</th>
                  <th className="px-4 py-2.5 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(auto => <WorkflowTableRow key={auto.id} auto={auto} />)}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No workflows match your search.</p>
          )}
        </div>
      )}
    </div>
  )
}
