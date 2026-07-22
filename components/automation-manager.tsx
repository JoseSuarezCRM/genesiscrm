"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { AutomationTrigger, AutomationAction, ReferralStatus, TaskPriority } from "@prisma/client"
import {
  createAutomation,
  updateAutomation,
  toggleAutomation,
  deleteAutomation,
  cloneAutomation,
  runScheduledAutomationsAction,
} from "@/app/actions/automations"
import { Zap, Plus, Minus, Trash2, Play, ChevronLeft, ChevronDown, Info, X, GitBranch, Flag, ScrollText, Maximize2, Clock, CalendarClock, Copy, Move, Clipboard, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { clinicDatetimeLocalValue, clinicDatetimeLocalToISO } from "@/lib/tz"
import { EMAIL_SENDER_OPTIONS } from "@/lib/graph-mailer"
import Link from "next/link"
import StyledSelect from "@/components/ui/styled-select"
import { RichTextEditor, tokensFromStrings, type PersonalizationToken } from "@/components/rich-text-editor"
import { EmailAttachments, type AttachmentRef } from "@/components/email-attachments"
import {
  type AutomationGraph, type GraphNode, type Slot, type ScheduleConfig,
  newNodeId, insertAt, deleteNode, updateNode, pruneUnreachable, legacyToGraph, waitLabel, WEEKDAY_NAMES,
  cloneStep, moveStep, extractSubtree, pasteSubgraph, moveSubtree, type Subgraph,
} from "@/lib/automation-graph"
import { MULTI_SEP, type Condition as PureCondition, type ConditionGroup } from "@/lib/automation-conditions"
import {
  REFERRAL_PROPERTY_DEFS, OPERATORS_BY_TYPE, IMAGING_OPTIONS, SURGERY_STATUS_OPTIONS, customPropertyToDef,
  OBJECT_PROPERTY_DEFS, OBJECT_CUSTOM_ENTITY,
  type PropertyDef, type CustomPropertyInput,
} from "@/lib/automation-properties"
import { WORKFLOW_OBJECTS, workflowObjectFor, workflowObjectsWith, isGenericTrigger, type CustomWorkflowObject } from "@/lib/workflow-objects"

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
  // Custom objects are workflow objects too (generic triggers only).
  customObjects?: (CustomWorkflowObject & { properties?: { id: string; name: string; type: string; options?: string[] }[] })[]
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
  RECORD_CREATED: "Record created",
  RECORD_PROPERTY_CHANGED: "Property changed",
  RECORD_OWNER_CHANGED: "Record owner changed",
  SMS_RECEIVED: "Patient replies by SMS",
  ENGAGEMENT_LOGGED: "Note / call / meeting logged",
  TASK_OVERDUE: "Task is overdue",
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_TASK: "Create a task",
  SEND_NOTIFICATION: "Send in-app notification",
  UPDATE_REFERRAL_STATUS: "Update referral status",
  ASSIGN_REFERRAL: "Assign referral to user",
  ADD_TAG: "Add tag to referral",
  SEND_EMAIL: "Send email",
  SEND_SMS: "Send SMS to patient",
  SEND_MEETING_INVITE: "Send meeting invite",
  SET_PROPERTY: "Set a property value",
  ASSIGN_OWNER: "Assign record owner",
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
  SEND_MEETING_INVITE: "bg-cyan-100 text-cyan-700",
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

// Tokens that actually resolve per workflow object — used to scope the Fields
// menu so you only see variables that will populate.
const TOKENS_BY_OBJECT: Record<string, string[]> = {
  REFERRAL: TEMPLATE_VARS,
  PROVIDER: ["{provider_name}", "{practice_name}", "{count}", "{period}"],
  PRACTICE: ["{practice_name}", "{count}", "{period}"],
  LOCATION: ["{count}", "{period}"],
  SURGERY: [
    "{patient_name}", "{patient_first_name}", "{procedure}", "{body_part}",
    "{surgical_provider}", "{surgery_date}", "{facility}", "{status}", "{call_count}",
  ],
}

function tokensForObject(objectKey: string): string[] {
  return TOKENS_BY_OBJECT[objectKey] ?? TEMPLATE_VARS
}

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

// Multi-select value picker. Values are joined by MULTI_SEP (not a comma) so
// that option values containing commas (e.g. "Horner, Nolan") work. Reads
// legacy comma/single values too.
function parseSelectedValues(value: string, options: { value: string }[]): string[] {
  if (value.includes(MULTI_SEP)) return value.split(MULTI_SEP).map(s => s.trim()).filter(Boolean)
  if (!value) return []
  if (options.some(o => o.value === value)) return [value]   // single value (may contain commas)
  return value.split(",").map(s => s.trim()).filter(Boolean)  // legacy multi
}

function MultiSelectValue({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = parseSelectedValues(value, options)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]
    onChange(next.join(MULTI_SEP))
  }

  const label = selected.length === 0
    ? "Select…"
    : selected.length <= 2
      ? selected.map(v => options.find(o => o.value === v)?.label ?? v).join(", ")
      : `${selected.length} selected`

  return (
    <div ref={ref} className="relative flex-1 min-w-[160px]">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-left bg-white hover:border-slate-300">
        <span className={cn("truncate", selected.length ? "text-slate-800" : "text-slate-400")}>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg py-1">
          {options.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No options</p>}
          {options.map(o => (
            <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" className="accent-blue-600" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="text-sm text-slate-700">{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function CriteriaValueInput({ def, cond, onChange, data }: {
  def: PropertyDef; cond: PureCondition; onChange: (v: string) => void; data: CriteriaData
}) {
  const opDef = OPERATORS_BY_TYPE[def.type].find(o => o.value === cond.op)
  if (opDef?.noValue) return null

  if (def.type === "tag" || def.type === "select") {
    return <MultiSelectValue options={optionsForProp(def, data)} value={cond.value} onChange={onChange} />
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
  if (type === "RECORD_CREATED") return { objectType: "", conditionGroups: [] }
  if (type === "RECORD_PROPERTY_CHANGED") return { objectType: "", property: "", toValue: "", conditionGroups: [] }
  if (type === "RECORD_OWNER_CHANGED") return { objectType: "", ownerId: "", conditionGroups: [] }
  if (type === "ENGAGEMENT_LOGGED") return { objectType: "", kind: "", conditionGroups: [] }
  if (type === "SMS_RECEIVED") return { keyword: "", matchType: "contains", conditionGroups: [] }
  if (type === "TASK_OVERDUE") return { priority: "", conditionGroups: [] }
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
  if (type === "SET_PROPERTY") return { property: "", value: "" }
  if (type === "ASSIGN_OWNER") return { ownerId: "" }
  if (type === "SEND_MEETING_INVITE") return { recipients: [{ type: "all_admins", value: "" }], sender: "referrals", title: "", location: "", description: "", eventMode: "fixed", eventDatetime: null, eventField: "", eventTime: "", durationMinutes: 30 }
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
    if (type === "RECORD_CREATED") {
      return <p className="text-xs text-slate-500">Fires whenever a new record is created on this object.</p>
    }

    if (type === "RECORD_PROPERTY_CHANGED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Property to watch</label>
            <StyledSelect className="w-full" value={(config.property as string) || ""} onChange={e => set("property", e.target.value)}>
              <option value="">Any property</option>
              {propDefs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              {customDefs.length > 0 && <option disabled>──────────</option>}
              {customDefs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </StyledSelect>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Only when the new value is (optional)</label>
            <input
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
              value={(config.toValue as string) || ""}
              onChange={e => set("toValue", e.target.value)}
              placeholder="Any value"
            />
          </div>
        </div>
      )
    }

    if (type === "ENGAGEMENT_LOGGED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Engagement type</label>
          <StyledSelect className="w-full" value={(config.kind as string) || ""} onChange={e => set("kind", e.target.value)}>
            <option value="">Any (note, call or meeting)</option>
            <option value="NOTE">Note</option>
            <option value="CALL">Call</option>
            <option value="MEETING">Meeting</option>
          </StyledSelect>
        </div>
      )
    }

    if (type === "SMS_RECEIVED") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Message contains (optional)</label>
            <input
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
              value={(config.keyword as string) || ""}
              onChange={e => set("keyword", e.target.value)}
              placeholder="Any message"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Match</label>
            <StyledSelect className="w-full" value={(config.matchType as string) || "contains"} onChange={e => set("matchType", e.target.value)}>
              <option value="contains">contains</option>
              <option value="exact">is exactly</option>
              <option value="starts_with">starts with</option>
            </StyledSelect>
          </div>
        </div>
      )
    }

    if (type === "TASK_OVERDUE") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Only for priority (optional)</label>
          <StyledSelect className="w-full" value={(config.priority as string) || ""} onChange={e => set("priority", e.target.value)}>
            <option value="">Any priority</option>
            {["LOW", "NORMAL", "HIGH", "URGENT"].map(p => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
          </StyledSelect>
          <p className="text-xs text-slate-400 mt-1">Checked once a day; each task fires this workflow only once.</p>
        </div>
      )
    }

    if (type === "RECORD_OWNER_CHANGED") {
      return (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Only when assigned to (optional)</label>
          <StyledSelect className="w-full" value={(config.ownerId as string) || ""} onChange={e => set("ownerId", e.target.value)}>
            <option value="">Anyone</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
          </StyledSelect>
        </div>
      )
    }

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
              <option value="record_email">Enrolled record's email</option>
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

interface MessageTemplateOption { id: string; name: string; channel: string }

function ActionConfigFields({
  type, config, onChange, users, tags, tokens = TEMPLATE_VARS, fieldTokens, dateProps = [], templates = [], writableProps = [],
}: {
  type: AutomationAction
  config: Record<string, unknown>
  onChange: (cfg: Record<string, unknown>) => void
  users: User[]
  tags: Tag[]
  tokens?: string[]
  // Rich labelled tokens (native + custom props) for the message-body Fields menu.
  fieldTokens?: PersonalizationToken[]
  dateProps?: PropertyDef[]
  templates?: MessageTemplateOption[]
  // Properties of the workflow's object that SET_PROPERTY can write to.
  writableProps?: PropertyDef[]
}) {
  const set = (key: string, val: unknown) => onChange({ ...config, [key]: val })

  if (type === ("SET_PROPERTY" as AutomationAction)) {
    const selected = writableProps.find(p => p.id === (config.property as string))
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Property</label>
          <StyledSelect className="w-full" value={(config.property as string) || ""} onChange={e => set("property", e.target.value)}>
            <option value="">Select a property…</option>
            {writableProps.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </StyledSelect>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Set it to</label>
          {selected?.options?.length ? (
            <StyledSelect className="w-full" value={(config.value as string) || ""} onChange={e => set("value", e.target.value)}>
              <option value="">Select a value…</option>
              {selected.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </StyledSelect>
          ) : (
            <input
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
              value={(config.value as string) ?? ""}
              onChange={e => set("value", e.target.value)}
              placeholder="Value (tokens like {record_name} work)"
            />
          )}
        </div>
      </div>
    )
  }

  if (type === ("ASSIGN_OWNER" as AutomationAction)) {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
        <StyledSelect className="w-full" value={(config.ownerId as string) || ""} onChange={e => set("ownerId", e.target.value)}>
          <option value="">— Unassigned —</option>
          <option value="triggering_user">The user who triggered this</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </StyledSelect>
      </div>
    )
  }

  // Sender choices for email/invite actions: the record owner, a shared mailbox,
  // or any user's integrated address (the value is that address).
  const workflowSenderOptions = (
    <>
      <option value="record_owner">Record owner (assigned or creator)</option>
      <optgroup label="Shared mailboxes">
        {EMAIL_SENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </optgroup>
      {users.length > 0 && (
        <optgroup label="People">
          {users.filter(u => u.email).map(u => <option key={u.id} value={u.email}>{u.email}</option>)}
        </optgroup>
      )}
    </>
  )
  const templateId = (config.templateId as string) || ""
  // Template picker shown for email/SMS actions; references a Communications template by id.
  const channelTemplates = templates.filter(t => t.channel === (type === "SEND_SMS" ? "SMS" : "EMAIL"))
  const pickTemplate = (id: string) => {
    const t = channelTemplates.find(x => x.id === id)
    if (t) onChange({ ...config, templateId: t.id, templateName: t.name })
    else { const c = { ...config }; delete c.templateId; delete c.templateName; onChange(c) }
  }
  const TemplatePicker = (type === "SEND_EMAIL" || (type as string) === "SEND_SMS") ? (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-slate-600 shrink-0">Template</label>
      <StyledSelect value={templateId} onChange={e => pickTemplate(e.target.value)} className="flex-1 h-8">
        <option value="">— Write a custom message —</option>
        {channelTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </StyledSelect>
      {templateId && (
        <span className="text-[11px] text-slate-400 shrink-0">from template</span>
      )}
    </div>
  ) : null
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
              {tokens.map(v => (
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
              {tokens.map(v => (
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
        {TemplatePicker}
        {templateId ? null : (
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
              {tokens.map(v => (
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
        )}
      </div>
    )
  }

  if (type === "SEND_EMAIL") {
    const toRows = (config.recipients as Recipient[]) ?? [{ type: "all_admins", value: "" }]
    const ccRows = (config.cc as Recipient[]) ?? []
    const bccRows = (config.bcc as Recipient[]) ?? []

    const schedule = (config.schedule as ScheduleConfig) ?? { mode: "immediate" }
    const setSchedule = (patch: Partial<ScheduleConfig>) => set("schedule", { ...schedule, ...patch })

    return (
      <div className="space-y-3">
        {TemplatePicker}
        {/* When to send */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2.5">
          <label className="text-xs font-semibold text-amber-700 block">When to send</label>
          <StyledSelect value={schedule.mode ?? "immediate"} onChange={e => setSchedule({ mode: e.target.value as ScheduleConfig["mode"] })} className="w-full">
            <option value="immediate">Immediately</option>
            <option value="field">Relative to a date on the record</option>
            <option value="fixed">At a specific date &amp; time</option>
          </StyledSelect>
          {schedule.mode === "field" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={schedule.offsetAmount ?? 0}
                  onChange={e => setSchedule({ offsetAmount: Math.max(0, Number(e.target.value) || 0) })}
                  className="w-20 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 bg-white" />
                <StyledSelect className="w-28" value={schedule.offsetUnit ?? "days"} onChange={e => setSchedule({ offsetUnit: e.target.value as any })}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </StyledSelect>
                <StyledSelect className="w-28" value={schedule.direction ?? "before"} onChange={e => setSchedule({ direction: e.target.value as any })}>
                  <option value="before">before</option>
                  <option value="after">after</option>
                </StyledSelect>
              </div>
              <StyledSelect className="w-full" value={schedule.field ?? ""} onChange={e => setSchedule({ field: e.target.value || null })}>
                <option value="">Select a date property…</option>
                {dateProps.map(p => <option key={p.id} value={p.path}>{p.label}</option>)}
              </StyledSelect>
              {dateProps.length === 0 && <p className="text-xs text-amber-700">This object has no date properties to schedule on.</p>}
            </div>
          )}
          {schedule.mode === "fixed" && (
            <input type="datetime-local" value={schedule.datetime ? schedule.datetime.slice(0, 16) : ""}
              onChange={e => setSchedule({ datetime: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 bg-white" />
          )}
        </div>

        {/* From */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="text-xs font-semibold text-blue-700 block mb-1.5">From (sender email)</label>
          <StyledSelect value={(config.sender as string) || "referrals"} onChange={e => set("sender", e.target.value)}
            className="w-full">
            {workflowSenderOptions}
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

        {!templateId && <>
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
              {tokens.map(v => (
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
              {tokens.map(v => (
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
            tokens={fieldTokens ?? tokensFromStrings(tokens)}
          />
        </div>
        </>}

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

  if (type === "SEND_MEETING_INVITE") {
    const toRows = (config.recipients as Recipient[]) ?? [{ type: "all_admins", value: "" }]
    const eventMode = (config.eventMode as string) || "fixed"
    const hasExternal = toRows.some(r => r.type === "record_email" || r.type === "email")
    return (
      <div className="space-y-3">
        {/* Organizer */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="text-xs font-semibold text-blue-700 block mb-1.5">Organizer (from)</label>
          <StyledSelect value={(config.sender as string) || "referrals"} onChange={e => set("sender", e.target.value)} className="w-full">
            {workflowSenderOptions}
          </StyledSelect>
        </div>

        {/* Attendees */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600">Attendees *</label>
            <button type="button" onClick={() => set("recipients", [...toRows, { type: "all_admins", value: "" }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <RecipientRows rows={toRows} users={users} onChange={next => set("recipients", next)} />
          {hasExternal && (
            <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              ⚠️ An external recipient is selected. Don&apos;t include patient PHI (name, diagnosis, etc.) in invites sent outside the organization.
            </p>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
          <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Follow-up with {provider_name}"
            value={(config.title as string) || ""} onChange={e => set("title", e.target.value)} />
        </div>

        {/* When */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
          <label className="text-xs font-semibold text-slate-600 block">Event date &amp; time</label>
          <StyledSelect value={eventMode} onChange={e => set("eventMode", e.target.value)} className="w-full">
            <option value="fixed">At a specific date &amp; time</option>
            <option value="field">On a date from the record</option>
          </StyledSelect>
          {eventMode === "fixed" && (
            <input type="datetime-local"
              value={config.eventDatetime ? clinicDatetimeLocalValue(new Date(config.eventDatetime as string)) : ""}
              onChange={e => set("eventDatetime", clinicDatetimeLocalToISO(e.target.value))}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400 bg-white" />
          )}
          {eventMode === "field" && (
            <div className="space-y-2">
              <StyledSelect className="w-full" value={(config.eventField as string) || ""} onChange={e => set("eventField", e.target.value)}>
                <option value="">Select a date property…</option>
                {dateProps.map(p => <option key={p.id} value={p.path}>{p.label}</option>)}
              </StyledSelect>
              {dateProps.length === 0 && <p className="text-xs text-amber-700">This object has no date properties.</p>}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">at</label>
                <input type="time" value={(config.eventTime as string) || ""} onChange={e => set("eventTime", e.target.value)}
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white" />
                <span className="text-xs text-slate-400">optional — defaults to the time on the date</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Duration</label>
            <input type="number" min={5} step={5} value={Number(config.durationMinutes) || 30}
              onChange={e => set("durationMinutes", Math.max(5, Number(e.target.value) || 30))}
              className="w-20 border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white" />
            <span className="text-xs text-slate-400">minutes</span>
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Location / link</label>
          <input className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. Genesis Ortho — Main Office, or a video link"
            value={(config.location as string) || ""} onChange={e => set("location", e.target.value)} />
        </div>

        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-slate-600">Description</label>
            <button type="button" onClick={() => setShowVars(v => !v)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Info className="h-3 w-3" /> Template vars
            </button>
          </div>
          {showVars && (
            <div className="flex flex-wrap gap-1 mb-2">
              {tokens.map(v => (
                <span key={v} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-slate-200"
                  onClick={() => set("description", ((config.description as string) || "") + v)}>{v}</span>
              ))}
            </div>
          )}
          <textarea rows={3} className="w-full border rounded-md px-3 py-2 text-sm resize-none"
            placeholder="Agenda / notes for the meeting…"
            value={(config.description as string) || ""} onChange={e => set("description", e.target.value)} />
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
  if ((type === "SEND_EMAIL" || (type as string) === "SEND_SMS") && config.templateName) return `${type === "SEND_EMAIL" ? "Send email" : "Send SMS"}: ${config.templateName} (template)`
  if (type === "SEND_EMAIL" && config.subject) return `Send email: ${config.subject}`
  if (type === "SEND_SMS") return "Send SMS"
  if (type === "SEND_MEETING_INVITE") return config.title ? `Send meeting invite: ${config.title}` : "Send meeting invite"
  if (type === "ADD_TAG") return "Add tag"
  if (type === "UPDATE_REFERRAL_STATUS" && config.status) return `Set status: ${config.status}`
  if (type === "ASSIGN_REFERRAL") return "Assign referral"
  if (type === "SEND_NOTIFICATION") return "Send notification"
  return ACTION_LABELS[type] ?? type
}

// vertical connector line
function VLine({ h = 22 }: { h?: number }) {
  return <div className="w-px bg-zinc-300" style={{ height: h }} />
}

// "+" insert control with a small action/branch menu
function InsertButton({ onAddAction, onAddDelay, onAddBranch, onAddMulti, pasteMode, onPaste, onCancelPaste }: {
  onAddAction: () => void; onAddDelay: () => void; onAddBranch: () => void; onAddMulti: () => void
  pasteMode?: "copy" | "move" | null; onPaste?: () => void; onCancelPaste?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(
          "w-7 h-7 rounded-full border bg-white flex items-center justify-center shadow-sm transition-all",
          pasteMode ? "border-indigo-400 text-indigo-500 ring-2 ring-indigo-100"
          : open ? "border-indigo-400 text-indigo-500 rotate-45"
          : "border-zinc-300 text-zinc-400 hover:border-indigo-400 hover:text-indigo-500",
        )}>
        <Plus className={cn("h-4 w-4 transition-transform", !pasteMode && open && "rotate-45")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setOpen(false)} />
          <div className="absolute left-1/2 -translate-x-1/2 top-9 z-50 bg-white border border-zinc-200 rounded-xl shadow-xl shadow-zinc-200/60 py-1.5 w-48">
            {pasteMode && (
              <>
                <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onPaste?.() }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2.5 text-indigo-700 font-medium">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    {pasteMode === "move" ? <Move className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                  </span>
                  {pasteMode === "move" ? "Move here" : "Paste here"}
                </button>
                <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onCancelPaste?.() }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 text-zinc-400">
                  Cancel {pasteMode === "move" ? "move" : "paste"}
                </button>
                <div className="my-1 border-t border-zinc-100" />
              </>
            )}
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddAction() }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-700">
              <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><Zap className="h-3.5 w-3.5" /></span> Action
            </button>
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddDelay() }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-700">
              <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Clock className="h-3.5 w-3.5" /></span> Delay
            </button>
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddBranch() }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-700">
              <span className="w-6 h-6 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><GitBranch className="h-3.5 w-3.5" /></span> If / Else
            </button>
            <button type="button" onMouseDown={e => { e.preventDefault(); setOpen(false); onAddMulti() }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-700">
              <span className="w-6 h-6 rounded-lg bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><GitBranch className="h-3.5 w-3.5 rotate-90" /></span> Branches
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Horizontal split: a rail spanning the columns with a drop line to each.
function BranchSplit({ columns }: { columns: { key: string; label: string; tone: "then" | "else" | "arm"; body: React.ReactNode }[] }) {
  const n = columns.length
  return (
    <div className="flex items-start">
      {columns.map((col, i) => (
        <div key={col.key} className="flex flex-col items-center px-5">
          {/* rail segment + vertical drop */}
          <div className="relative w-full h-4">
            {n > 1 && (
              <div className={cn(
                "absolute top-0 h-px bg-zinc-300",
                i === 0 ? "left-1/2 right-0" : i === n - 1 ? "left-0 right-1/2" : "left-0 right-0",
              )} />
            )}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px h-4 bg-zinc-300" />
          </div>
          <span className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide border shadow-sm bg-white max-w-[150px] truncate",
            col.tone === "then" ? "text-emerald-700 border-emerald-200"
              : col.tone === "else" ? "text-zinc-400 border-zinc-200"
              : "text-fuchsia-700 border-fuchsia-200",
          )} title={col.label}>
            {col.label}
          </span>
          <VLine h={16} />
          {col.body}
        </div>
      ))}
    </div>
  )
}

function FlowCanvas({ graph, onChange, onEditNode, header, propDefs = [] }: {
  graph: AutomationGraph
  onChange: (g: AutomationGraph) => void
  onEditNode: (id: string) => void
  header?: React.ReactNode
  propDefs?: PropertyDef[]
}) {
  const waitFieldLabels = Object.fromEntries(propDefs.map(p => [p.path, p.label]))

  // Clipboard for copy/paste + move. `following` = include all steps after it.
  type Clip =
    | { mode: "copy"; sub: Subgraph }
    | { mode: "move"; sourceId: string; following: boolean }
  const [clip, setClip] = useState<Clip | null>(null)
  const handleClone = (id: string) => onChange(cloneStep(graph, id))
  const handleCopy = (id: string) => {
    const node = graph.nodes[id]
    if (!node || !(node.kind === "action" || node.kind === "delay" || node.kind === "waitUntil")) return
    setClip({ mode: "copy", sub: { nodes: { [id]: { ...node, next: null } }, rootId: id } })
  }
  const handleCopyFollowing = (id: string) => { const s = extractSubtree(graph, id); if (s) setClip({ mode: "copy", sub: s }) }
  const handleMove = (id: string) => setClip({ mode: "move", sourceId: id, following: false })
  const handleMoveFollowing = (id: string) => setClip({ mode: "move", sourceId: id, following: true })
  const handlePaste = (slot: Slot) => {
    if (!clip) return
    if (clip.mode === "copy") onChange(pasteSubgraph(graph, clip.sub, slot))
    else onChange(clip.following ? moveSubtree(graph, clip.sourceId, slot) : moveStep(graph, clip.sourceId, slot))
    setClip(null)
  }
  const moveSourceId = clip?.mode === "move" ? clip.sourceId : null

  function addAction(slot: Slot) {
    const id = newNodeId()
    onChange(insertAt(graph, slot, { id, kind: "action", actionType: "CREATE_TASK", config: emptyActionConfig("CREATE_TASK"), next: null }))
    onEditNode(id)
  }
  function addDelay(slot: Slot) {
    const id = newNodeId()
    onChange(insertAt(graph, slot, { id, kind: "delay", mode: "duration", amount: 1, unit: "days", direction: "before", offsetUnit: "days", offsetAmount: 0, weekday: 1, timeOfDay: "09:00", next: null }))
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

    const insert = <InsertButton onAddAction={() => addAction(slot)} onAddDelay={() => addDelay(slot)} onAddBranch={() => addBranch(slot)} onAddMulti={() => addMulti(slot)}
      pasteMode={clip?.mode ?? null} onPaste={() => handlePaste(slot)} onCancelPaste={() => setClip(null)} />

    if (!startId || !graph.nodes[startId]) {
      return (
        <div className="flex flex-col items-center">
          <VLine />
          {insert}
          <VLine h={16} />
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-400 text-xs font-medium border border-zinc-200">
            <Flag className="h-3 w-3" /> End
          </div>
        </div>
      )
    }

    const node = graph.nodes[startId]
    return (
      <div className="flex flex-col items-center">
        <VLine />
        {insert}
        <VLine h={16} />
        {node.kind === "action" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              onClone={() => handleClone(node.id)} onCopy={() => handleCopy(node.id)} onMove={() => handleMove(node.id)}
              onCopyFollowing={() => handleCopyFollowing(node.id)} onMoveFollowing={() => handleMoveFollowing(node.id)}
              dimmed={moveSourceId === node.id}
              tone="action" icon={<Zap className="h-4 w-4" />} title={actionSummary(node.actionType as AutomationAction, node.config)} />
            {renderSlot({ kind: "after", nodeId: node.id }, depth + 1)}
          </>
        ) : node.kind === "delay" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              onClone={() => handleClone(node.id)} onCopy={() => handleCopy(node.id)} onMove={() => handleMove(node.id)}
              onCopyFollowing={() => handleCopyFollowing(node.id)} onMoveFollowing={() => handleMoveFollowing(node.id)}
              dimmed={moveSourceId === node.id}
              tone="delay" icon={<Clock className="h-4 w-4" />}
              title={waitLabel(node, waitFieldLabels)} subtitle="Delay before continuing" />
            {renderSlot({ kind: "after", nodeId: node.id }, depth + 1)}
          </>
        ) : node.kind === "waitUntil" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              onClone={() => handleClone(node.id)} onCopy={() => handleCopy(node.id)} onMove={() => handleMove(node.id)}
              onCopyFollowing={() => handleCopyFollowing(node.id)} onMoveFollowing={() => handleMoveFollowing(node.id)}
              dimmed={moveSourceId === node.id}
              tone="delay" icon={<CalendarClock className="h-4 w-4" />}
              title={waitLabel(node, waitFieldLabels)} subtitle="Scheduled wait" />
            {renderSlot({ kind: "after", nodeId: node.id }, depth + 1)}
          </>
        ) : node.kind === "branch" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              onCopyFollowing={() => handleCopyFollowing(node.id)} onMoveFollowing={() => handleMoveFollowing(node.id)}
              dimmed={moveSourceId === node.id}
              tone="branch" icon={<GitBranch className="h-4 w-4" />}
              title={node.rules.length || node.groups?.length ? `If conditions met` : "If / Else"}
              subtitle={`${node.rules.length || (node.groups?.[0]?.conditions.length ?? 0)} condition(s)`} />
            <VLine h={16} />
            <BranchSplit columns={[
              { key: "then", label: "Then", tone: "then", body: renderSlot({ kind: "then", nodeId: node.id }, depth + 1) },
              { key: "else", label: "Else", tone: "else", body: renderSlot({ kind: "else", nodeId: node.id }, depth + 1) },
            ]} />
          </>
        ) : node.kind === "multi" ? (
          <>
            <NodeChip onClick={() => onEditNode(node.id)} onDelete={() => onChange(deleteNode(graph, node.id))}
              onCopyFollowing={() => handleCopyFollowing(node.id)} onMoveFollowing={() => handleMoveFollowing(node.id)}
              dimmed={moveSourceId === node.id}
              tone="multi" icon={<GitBranch className="h-4 w-4 rotate-90" />}
              title="Branches" subtitle={`${node.arms.length} path${node.arms.length === 1 ? "" : "s"} + else`} />
            <VLine h={16} />
            <BranchSplit columns={[
              ...node.arms.map(arm => ({ key: arm.id, label: arm.label, tone: "arm" as const, body: renderSlot({ kind: "arm", nodeId: node.id, armId: arm.id }, depth + 1) })),
              { key: "else", label: "Else", tone: "else" as const, body: renderSlot({ kind: "else", nodeId: node.id }, depth + 1) },
            ]} />
          </>
        ) : null}
      </div>
    )
  }

  const viewportRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)

  const clampZoom = (z: number) => Math.min(1.5, Math.max(0.4, z))
  const resetView = () => { setPan({ x: 0, y: 0 }); setZoom(1) }

  function onCanvasMouseDown(e: React.MouseEvent) {
    // Pan only when grabbing the background — not nodes, buttons, or inputs.
    if ((e.target as HTMLElement).closest("button, input, a, select, label, textarea, [role=button]")) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    function move(e: MouseEvent) {
      const d = dragRef.current
      if (d) setPan({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) })
    }
    function up() { setDragging(false); dragRef.current = null }
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", up)
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up) }
  }, [dragging])

  // Wheel to zoom (non-passive so we can preventDefault page scroll).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      setZoom(z => clampZoom(z - e.deltaY * 0.0015))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  return (
    <div
      ref={viewportRef}
      onMouseDown={onCanvasMouseDown}
      className={cn(
        "relative h-full w-full overflow-hidden select-none",
        "bg-zinc-50 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:22px_22px]",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      {/* Zoom controls */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-xl border border-zinc-200 bg-white/95 shadow-sm p-1">
        <button type="button" onClick={() => setZoom(z => clampZoom(z - 0.1))}
          className="w-7 h-7 rounded-lg hover:bg-zinc-100 text-zinc-500 flex items-center justify-center"><Minus className="h-4 w-4" /></button>
        <span className="text-xs font-medium text-zinc-500 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => clampZoom(z + 0.1))}
          className="w-7 h-7 rounded-lg hover:bg-zinc-100 text-zinc-500 flex items-center justify-center"><Plus className="h-4 w-4" /></button>
        <div className="w-px h-5 bg-zinc-200 mx-0.5" />
        <button type="button" onClick={resetView}
          className="w-7 h-7 rounded-lg hover:bg-zinc-100 text-zinc-500 flex items-center justify-center" title="Reset view"><Maximize2 className="h-3.5 w-3.5" /></button>
      </div>

      <div
        className="absolute left-1/2 top-8"
        style={{ transform: `translate(calc(-50% + ${pan.x}px), ${pan.y}px) scale(${zoom})`, transformOrigin: "top center" }}
      >
        <div className="flex flex-col items-center min-w-fit">
          {header}
          {renderSlot({ kind: "root" })}
        </div>
      </div>
    </div>
  )
}

function NodeChip({ title, subtitle, icon, tone, onClick, onDelete, onClone, onCopy, onMove, onCopyFollowing, onMoveFollowing, dimmed }: {
  title: string; subtitle?: string; icon: React.ReactNode; tone: "action" | "branch" | "multi" | "delay"
  onClick: () => void; onDelete: () => void
  onClone?: () => void; onCopy?: () => void; onMove?: () => void
  onCopyFollowing?: () => void; onMoveFollowing?: () => void; dimmed?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const toneCls = tone === "action" ? "bg-blue-50 text-blue-600"
    : tone === "branch" ? "bg-violet-50 text-violet-600"
    : tone === "delay" ? "bg-amber-50 text-amber-600"
    : "bg-fuchsia-50 text-fuchsia-600"
  const tbBtn = "w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:bg-zinc-100 transition-colors"
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-xl border border-zinc-200 bg-white shadow-sm cursor-pointer hover:shadow-md hover:border-zinc-300 transition-all w-[244px]",
        dimmed && "opacity-40",
      )}
    >
      <span className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", toneCls)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800 truncate">{title}</p>
        {subtitle && <p className="text-xs text-zinc-400 truncate">{subtitle}</p>}
      </div>
      {/* Floating HubSpot-style toolbar: clone / move / copy / ⋯ / delete */}
      <div className={cn(
          "absolute -bottom-3.5 right-3 flex items-center gap-0.5 bg-white border border-zinc-200 rounded-lg shadow-sm px-1 py-0.5 transition-opacity z-20",
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={e => e.stopPropagation()}>
        {onClone && <button type="button" title="Clone" onClick={onClone} className={cn(tbBtn, "hover:text-indigo-500")}><Copy className="h-3.5 w-3.5" /></button>}
        {onMove && <button type="button" title="Move" onClick={onMove} className={cn(tbBtn, "hover:text-indigo-500")}><Move className="h-3.5 w-3.5" /></button>}
        {onCopy && <button type="button" title="Copy and paste" onClick={onCopy} className={cn(tbBtn, "hover:text-indigo-500")}><Clipboard className="h-3.5 w-3.5" /></button>}
        {(onCopyFollowing || onMoveFollowing) && (
          <div className="relative">
            <button type="button" title="More" onClick={() => setMenuOpen(o => !o)} className={cn(tbBtn, "hover:text-zinc-700", menuOpen && "bg-zinc-100 text-zinc-700")}>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 bottom-8 z-50 w-56 bg-white border border-zinc-200 rounded-xl shadow-xl py-1 text-left">
                  {onCopyFollowing && (
                    <button type="button" onClick={() => { setMenuOpen(false); onCopyFollowing() }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-700">
                      <Clipboard className="h-3.5 w-3.5 text-zinc-400" /> Copy with following steps
                    </button>
                  )}
                  {onMoveFollowing && (
                    <button type="button" onClick={() => { setMenuOpen(false); onMoveFollowing() }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 flex items-center gap-2.5 text-zinc-700">
                      <Move className="h-3.5 w-3.5 text-zinc-400" /> Move with following steps
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <button type="button" title="Delete" onClick={onDelete} className={cn(tbBtn, "hover:text-red-500")}><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

function NodeEditModal({ node, onSave, onClose, users, tags, practices, locations, pipelines, customDefs, propDefs, actions, tokens, fieldTokens, templates = [] }: {
  node: GraphNode
  onSave: (n: GraphNode) => void
  onClose: () => void
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]
  pipelines: Pipeline[]; customDefs: PropertyDef[]; propDefs: PropertyDef[]; actions: AutomationAction[]; tokens: string[]
  fieldTokens?: PersonalizationToken[]
  templates?: MessageTemplateOption[]
}) {
  const [draft, setDraft] = useState<GraphNode>(node)
  const criteriaData: CriteriaData = { users, practices, locations, tags, pipelines, customDefs, propDefs }
  const dateProps = propDefs.filter(p => p.type === "date")
  const writableProps = [...propDefs, ...customDefs]

  function updateArm(armId: string, patch: Partial<import("@/lib/automation-graph").BranchArm>) {
    if (draft.kind !== "multi") return
    setDraft({ ...draft, arms: draft.arms.map(a => a.id === armId ? { ...a, ...patch } : a) })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-overlay-in" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-modal-in" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold text-slate-800">
            {draft.kind === "branch" ? "Edit branch (if/else)" : draft.kind === "multi" ? "Edit branches" : draft.kind === "delay" ? "Edit delay" : "Edit action"}
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
                onChange={cfg => setDraft({ ...draft, config: cfg })} users={users} tags={tags} tokens={tokens} fieldTokens={fieldTokens} dateProps={dateProps} templates={templates} writableProps={writableProps} />
            </>
          ) : draft.kind === "delay" ? (
            <>
              <p className="text-xs text-slate-500">Pause the workflow before continuing to the next step. Choose what the delay is based on.</p>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Delay <span className="text-red-500">*</span></label>
                <StyledSelect className="w-full" value={draft.mode ?? "duration"}
                  onChange={e => setDraft({ ...draft, mode: e.target.value as any })}>
                  <option value="duration">For a set amount of time</option>
                  <option value="calendar">Until a calendar date</option>
                  <option value="property">Until a date property</option>
                  <option value="dayOfWeek">Until a day of the week</option>
                  <option value="timeOfDay">Until a specific time of day</option>
                </StyledSelect>
              </div>

              {(draft.mode ?? "duration") === "duration" ? (
                <div className="flex items-center gap-2">
                  <input type="number" min={1} value={draft.amount ?? 1}
                    onChange={e => setDraft({ ...draft, amount: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-24 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
                  <StyledSelect className="flex-1" value={draft.unit ?? "days"} onChange={e => setDraft({ ...draft, unit: e.target.value as any })}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </StyledSelect>
                </div>
              ) : draft.mode === "calendar" ? (
                <div className="space-y-1">
                  <input type="datetime-local" value={draft.datetime ? draft.datetime.slice(0, 16) : ""}
                    onChange={e => setDraft({ ...draft, datetime: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
                  <p className="text-xs text-slate-400">The workflow resumes at this date and time (e.g. a fixed launch date).</p>
                </div>
              ) : draft.mode === "property" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={draft.offsetAmount ?? 0}
                      onChange={e => setDraft({ ...draft, offsetAmount: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
                    <StyledSelect className="w-28" value={draft.offsetUnit ?? "days"} onChange={e => setDraft({ ...draft, offsetUnit: e.target.value as any })}>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </StyledSelect>
                    <StyledSelect className="w-28" value={draft.direction ?? "before"} onChange={e => setDraft({ ...draft, direction: e.target.value as any })}>
                      <option value="before">before</option>
                      <option value="after">after</option>
                    </StyledSelect>
                  </div>
                  <StyledSelect className="w-full" value={draft.field ?? ""} onChange={e => setDraft({ ...draft, field: e.target.value || null })}>
                    <option value="">Select a date property…</option>
                    {dateProps.map(p => <option key={p.id} value={p.path}>{p.label}</option>)}
                  </StyledSelect>
                  {dateProps.length === 0 && <p className="text-xs text-amber-600">This object has no date properties to wait on.</p>}
                </div>
              ) : draft.mode === "dayOfWeek" ? (
                <div className="space-y-1">
                  <StyledSelect className="w-full" value={String(draft.weekday ?? 1)} onChange={e => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                    {WEEKDAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </StyledSelect>
                  <p className="text-xs text-slate-400">Resumes on the next occurrence of this weekday.</p>
                </div>
              ) : draft.mode === "timeOfDay" ? (
                <div className="space-y-1">
                  <input type="time" value={draft.timeOfDay ?? "09:00"}
                    onChange={e => setDraft({ ...draft, timeOfDay: e.target.value || "09:00" })}
                    className="w-40 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
                  <p className="text-xs text-slate-400">Resumes at the next occurrence of this time (Central Time, Chicago).</p>
                </div>
              ) : null}
            </>
          ) : draft.kind === "waitUntil" ? (
            <>
              <p className="text-xs text-slate-500">Pause until a date, then continue. Useful for time-based sends (e.g. 1 day before a date on the record).</p>
              <div className="inline-flex bg-zinc-100 rounded-lg p-0.5 text-xs">
                <button type="button" onClick={() => setDraft({ ...draft, mode: "field" })}
                  className={cn("px-2.5 py-1 rounded-md font-medium", draft.mode === "field" ? "bg-zinc-900 text-white" : "text-zinc-500")}>Record date property</button>
                <button type="button" onClick={() => setDraft({ ...draft, mode: "fixed" })}
                  className={cn("px-2.5 py-1 rounded-md font-medium", draft.mode === "fixed" ? "bg-zinc-900 text-white" : "text-zinc-500")}>Specific date</button>
              </div>
              {draft.mode === "field" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={draft.offsetAmount}
                      onChange={e => setDraft({ ...draft, offsetAmount: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
                    <StyledSelect className="w-28" value={draft.offsetUnit} onChange={e => setDraft({ ...draft, offsetUnit: e.target.value as any })}>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </StyledSelect>
                    <StyledSelect className="w-28" value={draft.direction} onChange={e => setDraft({ ...draft, direction: e.target.value as any })}>
                      <option value="before">before</option>
                      <option value="after">after</option>
                    </StyledSelect>
                  </div>
                  <StyledSelect className="w-full" value={draft.field ?? ""} onChange={e => setDraft({ ...draft, field: e.target.value || null })}>
                    <option value="">Select a date property…</option>
                    {dateProps.map(p => <option key={p.id} value={p.path}>{p.label}</option>)}
                  </StyledSelect>
                  {dateProps.length === 0 && <p className="text-xs text-amber-600">This object has no date properties to wait on.</p>}
                </div>
              ) : (
                <input type="datetime-local" value={draft.datetime ? draft.datetime.slice(0, 16) : ""}
                  onChange={e => setDraft({ ...draft, datetime: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-400" />
              )}
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
          ) : draft.kind === "multi" ? (
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
          ) : null}
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

const OBJECT_BADGE_COLORS: Record<string, string> = {
  REFERRAL: "bg-blue-50 text-blue-700 border-blue-200",
  PROVIDER: "bg-teal-50 text-teal-700 border-teal-200",
  PRACTICE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  LOCATION: "bg-violet-50 text-violet-700 border-violet-200",
  SURGERY:  "bg-rose-50 text-rose-700 border-rose-200",
}

// ─── Full-page workflow editor (HubSpot-style) ───────────────────────────────

export function WorkflowEditor({ editing, users, tags, practices, locations, pipelines = [], customPropsByEntity = {}, templates = [], customObjects = [] }: {
  editing: Automation | null
  users: User[]; tags: Tag[]; practices: Practice[]; locations: Location[]; pipelines?: Pipeline[]
  customPropsByEntity?: Record<string, CustomPropertyInput[]>
  templates?: MessageTemplateOption[]
  customObjects?: (CustomWorkflowObject & { properties?: { id: string; name: string; type: string; options?: string[] }[] })[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [objectKey, setObjectKey] = useState(
    workflowObjectFor(
      editing?.triggerType ?? "REFERRAL_CREATED",
      (editing?.triggerConfig as Record<string, unknown> | undefined)?.objectType as string | undefined,
    ).key,
  )
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
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [error, setError] = useState("")

  const allObjects = workflowObjectsWith(customObjects)
  const objectDef = allObjects.find(o => o.key === objectKey) ?? allObjects[0]
  // A custom object's properties come from its definition, not the static catalog.
  const customObjectDef = customObjects.find(c => `CO:${c.key}` === objectKey)
  const propDefs: PropertyDef[] = customObjectDef
    ? (customObjectDef.properties ?? []).map(p => ({
        id: p.id,
        label: p.name,
        type: (p.type === "NUMBER" ? "number" : p.type === "DATE" ? "date" : p.type === "CHECKBOX" ? "boolean"
          : p.type === "DROPDOWN" || p.type === "MULTI_SELECT" ? "select" : "text") as PropertyDef["type"],
        path: p.id,
        options: (p.options ?? []).map(o => ({ value: o, label: o })),
      }))
    : OBJECT_PROPERTY_DEFS[objectKey] ?? REFERRAL_PROPERTY_DEFS
  const objectEntity = OBJECT_CUSTOM_ENTITY[objectKey]
  const rawCustoms = objectEntity ? customPropsByEntity[objectEntity] ?? [] : []
  const customDefs = rawCustoms.map(customPropertyToDef)
  const objectActions = actionsForObject(objectKey)
  const objectTokens = tokensForObject(objectKey)
  // Fields menu for message bodies: native tokens + every custom property of the
  // object, addressed by its readable internal name, so newly-created properties
  // are usable in workflow sends.
  const objectFieldTokens: PersonalizationToken[] = [
    ...tokensFromStrings(objectTokens),
    ...rawCustoms.map(c => ({ label: c.name, value: `{${c.internalName || c.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}}` })),
  ]

  function handleObjectChange(key: string) {
    setObjectKey(key)
    const first = (allObjects.find(o => o.key === key) ?? allObjects[0]).triggers[0]
    setTriggerType(first)
    setTriggerConfig({ ...emptyTriggerConfig(first), ...(isGenericTrigger(first) ? { objectType: key } : {}) })
  }

  function handleTriggerChange(t: string) {
    setTriggerType(t)
    // Generic triggers must remember which object they belong to.
    setTriggerConfig({ ...emptyTriggerConfig(t), ...(isGenericTrigger(t) ? { objectType: objectKey } : {}) })
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
          triggerType: triggerType as AutomationTrigger,
          triggerConfig: isGenericTrigger(triggerType) ? { ...triggerConfig, objectType: objectKey } : triggerConfig,
          actionType: effectiveActionType, actionConfig: {},
          flow: null, graph: graph as unknown as Record<string, unknown>,
          isActive: editing.isActive,
        })
      } else {
        await createAutomation({
          name: name.trim(), description: description.trim() || undefined,
          triggerType: triggerType as AutomationTrigger,
          triggerConfig: isGenericTrigger(triggerType) ? { ...triggerConfig, objectType: objectKey } : triggerConfig,
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
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="z-20 bg-slate-900 text-white px-5 py-3 flex items-center gap-4 shrink-0">
        <Link href="/automations" className="flex items-center gap-1 text-sm text-slate-300 hover:text-white transition-colors shrink-0">
          <ChevronLeft className="h-4 w-4" /> Workflows
        </Link>
        <div className="w-px h-5 bg-slate-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Untitled workflow"
            className="w-full bg-transparent text-base font-semibold placeholder:text-slate-500 outline-none leading-tight"
          />
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add a description…"
            className="w-full bg-transparent text-xs text-slate-400 placeholder:text-slate-600 outline-none leading-tight"
          />
        </div>
        {editing && (
          <span className={cn(
            "flex items-center gap-1.5 text-xs font-semibold shrink-0",
            editing.isActive ? "text-emerald-400" : "text-slate-400"
          )}>
            <span className={cn("w-2 h-2 rounded-full", editing.isActive ? "bg-emerald-400" : "bg-slate-500")} />
            {editing.isActive ? "ON" : "OFF"}
          </span>
        )}
        {editing && (
          <Link href={`/automations/${editing.id}/logs`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-white shrink-0">
            <ScrollText className="h-3.5 w-3.5" /> Logs
          </Link>
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

      {/* Canvas — full-bleed, fills the screen below the top bar */}
      <div className="flex-1 min-h-0 relative">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-sm text-red-600 bg-white border border-red-200 rounded-lg px-3 py-1.5 shadow-sm">{error}</div>
        )}
        <FlowCanvas
          graph={graph}
          onChange={setGraph}
          onEditNode={setEditingNodeId}
          propDefs={propDefs}
          header={
            <button
              type="button"
              onClick={() => setTriggerOpen(true)}
              className="group flex items-start gap-3 pl-2.5 pr-4 py-3 rounded-xl border border-amber-300 bg-white shadow-sm hover:shadow-md hover:border-amber-400 transition-all w-[300px] text-left"
            >
              <span className="shrink-0 w-9 h-9 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center"><Zap className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Trigger · {objectDef.label}</p>
                <p className="text-sm font-medium text-zinc-800 truncate">{TRIGGER_LABELS[triggerType] ?? triggerType}</p>
                <p className="text-xs text-zinc-400 truncate">{triggerSummary(triggerConfig)}</p>
              </div>
            </button>
          }
        />
      </div>

      {/* Trigger edit modal */}
      {triggerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-overlay-in" onMouseDown={() => setTriggerOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto animate-modal-in" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center"><Zap className="h-4 w-4" /></span>
                <h3 className="text-sm font-semibold text-zinc-800">Trigger — workflow enrollment</h3>
              </div>
              <button onClick={() => setTriggerOpen(false)} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Runs on object</label>
                <StyledSelect className="w-full" value={objectKey} onChange={e => handleObjectChange(e.target.value)}>
                  {allObjects.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </StyledSelect>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">When this happens</label>
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
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setTriggerOpen(false)} className="px-4 py-2 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800">Done</button>
            </div>
          </div>
        </div>
      )}

      {editingNode && (
        <NodeEditModal
          node={editingNode}
          onClose={() => setEditingNodeId(null)}
          onSave={(n) => { setGraph(pruneUnreachable(updateNode(graph, n))); setEditingNodeId(null) }}
          users={users} tags={tags} practices={practices} locations={locations}
          pipelines={pipelines} customDefs={customDefs} propDefs={propDefs} actions={objectActions} tokens={objectTokens}
          fieldTokens={objectFieldTokens} templates={templates}
        />
      )}
    </div>
  )
}

// Short human summary of a trigger's enrollment criteria for the compact node.
function triggerSummary(config: Record<string, unknown>): string {
  const groups = (config.conditionGroups as ConditionGroup[]) ?? []
  const count = groups.reduce((sum, g) => sum + (g.conditions?.length ?? 0), 0)
  const parts: string[] = []
  if (config.toStatus) parts.push(`to ${config.toStatus}`)
  if (count > 0) parts.push(`${count} condition${count === 1 ? "" : "s"}`)
  return parts.length ? parts.join(" · ") : "No enrollment filters"
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

  function handleClone() {
    startTransition(async () => {
      const res = await cloneAutomation(auto.id)
      if (res?.id) router.push(`/automations/${res.id}`)
      else router.refresh()
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
        <div className="flex items-center justify-end gap-0.5">
          <Link href={`/automations/${auto.id}/logs`} title="View action logs"
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <ScrollText className="h-3.5 w-3.5" />
          </Link>
          <button onClick={handleClone} disabled={isPending}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors" title="Clone workflow">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={handleDelete} disabled={isPending}
            className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
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
                  <th className="px-4 py-2.5 w-20"></th>
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
