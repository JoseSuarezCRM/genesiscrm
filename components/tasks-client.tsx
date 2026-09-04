"use client"

import StyledSelect from "@/components/ui/styled-select"
import DatePicker from "@/components/ui/date-picker"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useState, useTransition, useEffect, useRef } from "react"
import { TaskStatus, TaskPriority, TaskType, TaskRepeat } from "@prisma/client"
import { createTask, updateTask, updateTaskStatus, deleteTask, createTaskQueue, bulkDeleteTasks, bulkUpdateTasks } from "@/app/actions/tasks"
import { searchAssociableRecords } from "@/app/actions/associations"
import { updateRecordField } from "@/app/actions/record-fields"
import { setRecordOwner } from "@/app/actions/record-owner"
import { createTaskView, updateTaskView, deleteTaskView } from "@/app/actions/task-views"
import { reorderViews } from "@/app/actions/view-order"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NotesTextarea, type NotesTextareaHandle } from "@/components/ui/notes-textarea"
import { dateSortValue, numberSortValue } from "@/lib/date-values"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Plus, Pencil, Trash2, Loader2, CheckCircle2, Circle, AlertCircle, Search, X, Link2, Clock,
  Columns3, ChevronDown, ChevronUp, LayoutList, Table2, Download, Check, Globe, Users, UserCog,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  TASK_STAGES, stageMeta, TASK_TYPES, typeLabel, TASK_REPEATS,
  PRIORITY_LABELS, PRIORITY_DOT, REMINDER_OPTIONS, reminderLabel,
} from "@/lib/task-meta"
import { EditableCell } from "@/components/ui/editable-cell"
import { cpToFieldDef } from "@/lib/cp-field-def"
import { type RecordFieldDef } from "@/lib/record-field-catalog"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import ColumnChooserModal from "@/components/ui/column-chooser"
import { useColumnPrefs } from "@/components/ui/use-column-prefs"
import { useCardReorder } from "@/components/use-card-reorder"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import BulkActionBar, { bulkBtn, bulkDanger } from "@/components/ui/bulk-action-bar"
import ExportDialog from "@/components/ui/export-dialog"
import FilterBuilder from "@/components/ui/filter-builder"
import { ViewAccessSelector, type ViewAccessValue, type ShareUser, type ShareTeam } from "@/components/view-access-selector"
import { type FilterField, type FilterState, emptyFilter, matchesFilter, activeConditionCount, customPropertyFilterFields } from "@/lib/filters"
import { associationColumns, readAssocValue, type AssociationGroup } from "@/lib/association-columns"

// ─── Types ────────────────────────────────────────────────────────────────────

type User = { id: string; name: string | null; email: string }
type Queue = { id: string; name: string }
type ObjectType = { key: string; label: string }
type Assoc = { type: string; typeLabel: string; id: string; name: string; url: string }
type Task = {
  id: string
  title: string
  description: string | null
  dueDate: string | Date | null
  priority: TaskPriority
  status: TaskStatus
  type: TaskType
  repeat: TaskRepeat
  reminderMinutesBefore: number | null
  queue: Queue | null
  createdBy: User
  assignedTo: User | null
  associations: Assoc[]
  __assoc?: Record<string, any> // first linked record per associated type, for association columns
  createdAt: string | Date
  customProperties?: Record<string, any> | null
}

type TaskCustomPropDef = { id: string; name: string; type: string; options?: string[]; optionLabels?: Record<string, string> | null; optionColors?: Record<string, string> | null; optionStyle?: string | null; numberFormat?: string | null }
type SavedTaskView = { id: string; name: string; config: { filter?: FilterState; columns?: string[]; frozen?: number; viewMode?: "table" | "cards" }; visibility?: string; isOwner?: boolean }

// ─── Association picker ─────────────────────────────────────────────────────────

function AssociationPicker({ objectTypes, value, onChange }: {
  objectTypes: ObjectType[]
  value: Assoc[]
  onChange: (v: Assoc[]) => void
}) {
  const [type, setType] = useState(objectTypes[0]?.key ?? "")
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string; url: string; sub?: string }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!type) return
    let active = true
    setLoading(true)
    const h = setTimeout(async () => {
      const r = await searchAssociableRecords(type, q.trim())
      if (active) { setResults(r as any); setLoading(false) }
    }, 200)
    return () => { active = false; clearTimeout(h) }
  }, [type, q])

  useEffect(() => {
    function onDown(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  const typeLabelOf = (k: string) => objectTypes.find((o) => o.key === k)?.label ?? k
  const add = (r: { id: string; name: string; url: string }) => {
    if (value.some((v) => v.type === type && v.id === r.id)) return
    onChange([...value, { type, typeLabel: typeLabelOf(type), id: r.id, name: r.name, url: r.url }])
    setQ(""); setOpen(false)
  }
  const remove = (a: Assoc) => onChange(value.filter((v) => !(v.type === a.type && v.id === a.id)))

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <StyledSelect value={type} onChange={(e) => { setType(e.target.value); setOpen(true) }} className="w-40 shrink-0">
          {objectTypes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </StyledSelect>
        <div ref={boxRef} className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={`Search ${typeLabelOf(type).toLowerCase()}…`}
            className="w-full h-9 pl-8 pr-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-zinc-400"
          />
          {open && (
            <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg py-1">
              {loading ? (
                <div className="px-3 py-2 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
              ) : results.map((r) => (
                <button key={r.id} type="button" onClick={() => add(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex flex-col">
                  <span className="text-slate-800">{r.name}</span>
                  {r.sub && <span className="text-xs text-slate-400">{r.sub}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((a) => (
            <span key={`${a.type}:${a.id}`} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-slate-100 text-xs text-slate-700">
              <span className="text-slate-400">{a.typeLabel}:</span> {a.name}
              <button type="button" onClick={() => remove(a)} className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Form ────────────────────────────────────────────────────────────────

type FormValues = {
  title: string; description: string; dueDate: string; priority: TaskPriority
  status: TaskStatus; type: TaskType; repeat: TaskRepeat; reminderMinutesBefore: number | null
  queueId: string; assignedToId: string; associations: Assoc[]
}

function TaskForm({ users, queues: initialQueues, objectTypes, defaultValues, onSubmit, isPending, onClose, submitLabel }: {
  users: User[]
  queues: Queue[]
  objectTypes: ObjectType[]
  defaultValues?: Partial<FormValues>
  onSubmit: (d: FormValues) => Promise<void>
  isPending: boolean
  onClose: () => void
  submitLabel: string
}) {
  const [v, setV] = useState<FormValues>({
    title: defaultValues?.title ?? "",
    description: defaultValues?.description ?? "",
    dueDate: defaultValues?.dueDate ?? "",
    priority: defaultValues?.priority ?? "NORMAL",
    status: defaultValues?.status ?? "NOT_STARTED",
    type: defaultValues?.type ?? "TODO",
    repeat: defaultValues?.repeat ?? "NONE",
    reminderMinutesBefore: defaultValues?.reminderMinutesBefore ?? null,
    queueId: defaultValues?.queueId ?? "",
    assignedToId: defaultValues?.assignedToId ?? "",
    associations: defaultValues?.associations ?? [],
  })
  const [queues, setQueues] = useState(initialQueues)
  const [newQueue, setNewQueue] = useState<string | null>(null)
  const [err, setErr] = useState("")
  const descRef = useRef<NotesTextareaHandle>(null)
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }))

  async function addQueue() {
    const name = (newQueue ?? "").trim()
    if (!name) { setNewQueue(null); return }
    const r = await createTaskQueue(name)
    if ((r as any)?.id) {
      setQueues((prev) => prev.some((x) => x.id === (r as any).id) ? prev : [...prev, { id: (r as any).id, name: (r as any).name }])
      set("queueId", (r as any).id)
    }
    setNewQueue(null)
  }

  const fieldLabel = "text-sm font-medium text-slate-700"

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.title.trim()) { setErr("Task title is required"); return }
        // Notes commits on blur (so voice dictation isn't interrupted) — read it
        // straight from the field, since that setState hasn't landed yet.
        await onSubmit({ ...v, description: descRef.current?.flush() ?? v.description })
      }}
      className="space-y-4"
    >
      {/* Full-width scroll region (negative margin cancels the dialog's p-6 so the
          scrollbar sits at the edge and focus rings aren't clipped). */}
      <div className="space-y-4 max-h-[62vh] overflow-y-auto overflow-x-hidden -mx-6 px-6 py-1">
      <div className="space-y-1.5">
        <Label className={fieldLabel}>Task title *</Label>
        <Input value={v.title} onChange={(e) => { set("title", e.target.value); setErr("") }} placeholder="What needs to be done?" autoFocus />
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>

      <div className="space-y-1.5">
        <Label className={fieldLabel}>Due date</Label>
        <DatePicker withTime autoOpen={false} value={v.dueDate} onCommit={(val) => set("dueDate", val)} onCancel={() => {}} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={v.repeat !== "NONE"} onChange={(e) => set("repeat", e.target.checked ? "DAILY" : "NONE")} className="accent-blue-600 rounded border-slate-300" />
        Set to repeat
      </label>
      {v.repeat !== "NONE" && (
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Repeats</Label>
          <StyledSelect value={v.repeat} onChange={(e) => set("repeat", e.target.value as TaskRepeat)} className="w-full">
            {TASK_REPEATS.filter((r) => r.value !== "NONE").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </StyledSelect>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Task type *</Label>
          <StyledSelect value={v.type} onChange={(e) => set("type", e.target.value as TaskType)} className="w-full">
            {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </StyledSelect>
        </div>
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Task stage</Label>
          <StyledSelect value={v.status} onChange={(e) => set("status", e.target.value as TaskStatus)} className="w-full">
            {TASK_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </StyledSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={fieldLabel}>Associate task with</Label>
        <AssociationPicker objectTypes={objectTypes} value={v.associations} onChange={(val) => set("associations", val)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Assigned to</Label>
          <StyledSelect value={v.assignedToId} onChange={(e) => set("assignedToId", e.target.value)} className="w-full">
            <option value="">— Unassigned —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </StyledSelect>
        </div>
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Priority</Label>
          <StyledSelect value={v.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)} className="w-full">
            {Object.values(TaskPriority).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </StyledSelect>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Queue</Label>
          {newQueue !== null ? (
            <div className="flex gap-1.5">
              <Input value={newQueue} onChange={(e) => setNewQueue(e.target.value)} placeholder="Queue name" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQueue() } }} />
              <Button type="button" size="sm" onClick={addQueue}>Add</Button>
            </div>
          ) : (
            <StyledSelect value={v.queueId} onChange={(e) => { if (e.target.value === "__new") setNewQueue(""); else set("queueId", e.target.value) }} className="w-full">
              <option value="">None</option>
              {queues.map((qq) => <option key={qq.id} value={qq.id}>{qq.name}</option>)}
              <option value="__new">＋ New queue…</option>
            </StyledSelect>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className={fieldLabel}>Reminder</Label>
          <StyledSelect value={String(v.reminderMinutesBefore ?? "")} onChange={(e) => set("reminderMinutesBefore", e.target.value === "" ? null : Number(e.target.value))} className="w-full">
            {REMINDER_OPTIONS.map((r) => <option key={String(r.value)} value={r.value === null ? "" : r.value}>{r.label}</option>)}
          </StyledSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={fieldLabel}>Notes</Label>
        <NotesTextarea
          ref={descRef}
          value={v.description}
          onChange={(val) => set("description", val)}
          placeholder="Add description…"
          rows={3}
          className="flex min-h-0 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{submitLabel}</Button>
      </DialogFooter>
    </form>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function fmtDue(d: string | Date) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
}

function TaskRow({ task, currentUserId, onStatusChange, onEdit, onDelete, highlighted }: {
  task: Task
  currentUserId: string
  onStatusChange: (id: string, status: TaskStatus) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  highlighted: boolean
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const isDone = task.status === "COMPLETED"
  const isOverdue = task.dueDate && !isDone && new Date(task.dueDate) < new Date()
  const stage = stageMeta(task.status)

  useEffect(() => {
    if (highlighted && rowRef.current) rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlighted])

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex items-start gap-3 p-3.5 rounded-xl border bg-white transition-colors",
        isDone && "opacity-70",
        highlighted && "ring-2 ring-blue-400 border-blue-300"
      )}
    >
      <button
        onClick={() => onStatusChange(task.id, isDone ? "NOT_STARTED" : "COMPLETED")}
        className="mt-0.5 shrink-0"
        title={isDone ? "Mark as not started" : "Mark as completed"}
      >
        {isDone ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-slate-500" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-medium", isDone && "line-through text-slate-400")}>{task.title}</span>
          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", stage.pill)}>{stage.label}</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{typeLabel(task.type)}</span>
          {task.priority !== "NORMAL" && task.priority !== "LOW" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[task.priority])} />{PRIORITY_LABELS[task.priority]}
            </span>
          )}
        </div>
        {task.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>}

        {task.associations.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Link2 className="h-3 w-3 text-slate-300" />
            {task.associations.map((a) => (
              <Link key={`${a.type}:${a.id}`} href={a.url} className="text-xs text-blue-600 hover:underline">
                {a.name}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs">
          {task.dueDate && (
            <span className={cn("flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-slate-400")}>
              {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              Due {fmtDue(task.dueDate)}
            </span>
          )}
          {task.reminderMinutesBefore != null && <span className="text-slate-400">· {reminderLabel(task.reminderMinutesBefore)}</span>}
          {task.queue && <span className="text-slate-400">· Queue: {task.queue.name}</span>}
          <span className="text-slate-400">
            {task.assignedTo ? `→ ${task.assignedTo.id === currentUserId ? "You" : (task.assignedTo.name || task.assignedTo.email)}` : "Unassigned"}
          </span>
        </div>
      </div>

      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => onDelete(task.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ── Task table columns ──────────────────────────────────────────────────────
const TASK_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "status", label: "Stage", sortable: true },
  { key: "type", label: "Type" },
  { key: "priority", label: "Priority", sortable: true },
  { key: "dueDate", label: "Due Date", sortable: true },
  { key: "assignedTo", label: "Assigned To" },
  { key: "queue", label: "Queue" },
  { key: "associations", label: "Associations" },
  { key: "reminder", label: "Reminder" },
  { key: "repeat", label: "Repeat" },
  { key: "createdBy", label: "Created By" },
  { key: "created", label: "Created" },
]
const DEFAULT_TASK_COLS = ["status", "type", "priority", "dueDate", "assignedTo"]
const TASK_COL_W: Record<string, number> = { title: 260, status: 130, type: 100, priority: 110, dueDate: 190, assignedTo: 160, queue: 140, associations: 220, reminder: 150, repeat: 130, createdBy: 150, created: 130 }
const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
const STAGE_ORDER: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, WAITING: 2, DEFERRED: 3, COMPLETED: 4 }

export default function TasksClient({ tasks: initialTasks, users, queues, objectTypes, currentUserId, highlight, initialFilter, canManage = true, canDelete = false, customProps = [], savedViews = [], shareUsers = [], shareTeams = [], associations = [] }: {
  tasks: Task[]
  users: User[]
  queues: Queue[]
  objectTypes: ObjectType[]
  currentUserId: string
  highlight?: string
  initialFilter?: string
  canManage?: boolean
  canDelete?: boolean
  customProps?: TaskCustomPropDef[]
  savedViews?: SavedTaskView[]
  shareUsers?: ShareUser[]
  shareTeams?: ShareTeam[]
  associations?: AssociationGroup[]
}) {
  const [isPending, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initialTasks)
  const [quick, setQuick] = useState(initialFilter ?? "all")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [colModalOpen, setColModalOpen] = useState(false)

  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

  const assignableUsers = users.map((u) => ({ id: u.id, label: u.name || u.email }))
  const ownerUserMap = Object.fromEntries(assignableUsers.map((u) => [u.id, u.label]))
  const cpById = Object.fromEntries(customProps.map((p) => [p.id, p]))
  // Association columns (linked-record fields): available in the chooser, opt-in per table.
  const { columns: assocColumns, byKey: assocByKey } = associationColumns(associations)

  function run(fn: () => Promise<{ success?: boolean; error?: unknown } | undefined>) {
    startTransition(async () => {
      const r = await fn()
      if (r?.error) setError(typeof r.error === "string" ? r.error : "Something went wrong.")
    })
  }
  function handleStatusChange(id: string, status: TaskStatus) {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t))
    run(() => updateTaskStatus(id, status))
  }
  async function handleDelete(id: string) {
    if (!(await confirmDialog("Delete this task? This cannot be undone."))) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
    run(() => deleteTask(id))
  }

  // ── View mode + columns ──
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const allTaskCols = [...TASK_COLUMNS, ...customProps.map((p) => ({ key: `cp_${p.id}`, label: p.name })), ...assocColumns.map((c) => ({ key: c.key, label: c.label, sortable: true, group: c.group }))]
  const { columns: visibleCols, frozen: frozenCount, apply: applyCols, setColumns: setVisibleCols } = useColumnPrefs("taskCols", DEFAULT_TASK_COLS)
  const { colWidth, startResize } = useColumnResize("taskColWidths")
  const cols = (visibleCols.map((k) => allTaskCols.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string; sortable?: boolean }[])
  const colReorder = useCardReorder(cols, (c) => c.key, (ids) => setVisibleCols(ids))
  const widthOf = (k: string) => k === "title" ? (colWidth("title") ?? 260) : (colWidth(k) ?? TASK_COL_W[k] ?? 160)
  const fmap = frozenMap(["title", ...colReorder.order.map((c) => c.key)], frozenCount, widthOf, 40)
  const cbFrozen = frozenCount > 0

  // ── Filters (advanced + quick pills) ──
  const filterFields: FilterField[] = [
    { key: "title", label: "Title", type: "text", getValue: (t: any) => t.title },
    { key: "status", label: "Stage", type: "select", options: TASK_STAGES.map((s) => ({ value: s.value, label: s.label })), getValue: (t: any) => t.status },
    { key: "priority", label: "Priority", type: "select", options: Object.entries(PRIORITY_LABELS).map(([v, l]) => ({ value: v, label: l })), getValue: (t: any) => t.priority },
    { key: "type", label: "Type", type: "select", options: TASK_TYPES.map((x) => ({ value: x.value, label: x.label })), getValue: (t: any) => t.type },
    { key: "assignedTo", label: "Assigned To", type: "select", options: assignableUsers.map((u) => ({ value: u.id, label: u.label })), getValue: (t: any) => t.assignedTo?.id ?? "" },
    { key: "dueDate", label: "Due Date", type: "date", getValue: (t: any) => t.dueDate },
    ...customPropertyFilterFields(customProps.map((p) => ({ id: p.id, name: p.name, type: p.type, options: p.options })), "customProperties"),
  ]
  const [filter, setFilter] = useState<FilterState>(emptyFilter())
  const filtersActive = activeConditionCount(filter, filterFields) > 0

  const quickPass = (t: Task) => {
    if (quick === "mine") return t.assignedTo?.id === currentUserId || (!t.assignedTo && t.createdBy.id === currentUserId)
    if (quick === "created") return t.createdBy.id === currentUserId
    if (quick === "open") return t.status !== "COMPLETED"
    if (quick === "overdue") return !!t.dueDate && t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()
    return true
  }
  const filtered = tasks.filter((t) => quickPass(t) && matchesFilter(t, filter, filterFields))

  // ── Sort ──
  const [sortKey, setSortKey] = useState<string>("dueDate")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(k); setSortDir(k === "created" || k === "dueDate" ? "asc" : "asc") }
  }
  const sortVal = (t: Task, k: string): string | number => {
    if (k === "title") return t.title.toLowerCase()
    if (k === "status") return STAGE_ORDER[t.status] ?? 9
    if (k === "priority") return PRIORITY_ORDER[t.priority] ?? 9
    if (k === "dueDate") return t.dueDate ? new Date(t.dueDate).getTime() : Number.MAX_SAFE_INTEGER
    if (k === "created") return new Date(t.createdAt).getTime()
    if (assocByKey[k]) {
      const f = assocByKey[k]; const v = readAssocValue(t, f)
      // Compare values, not rendered labels — see lib/date-values.ts.
      if (f.type === "number") return numberSortValue(v)
      if (f.type === "date") return dateSortValue(v)
      return v.toLowerCase()
    }
    return ""
  }
  const sorted = [...filtered].sort((a, b) => {
    const va = sortVal(a, sortKey), vb = sortVal(b, sortKey)
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
    return sortDir === "asc" ? cmp : -cmp
  })
  const SortIcon = ({ k }: { k: string }) => sortKey === k ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null

  const openCount = tasks.filter((t) => t.status !== "COMPLETED" && (t.assignedTo?.id === currentUserId || (!t.assignedTo && t.createdBy.id === currentUserId))).length
  const overdueCount = tasks.filter((t) => t.dueDate && t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()).length
  const FILTERS = [
    { key: "all", label: "All Tasks" },
    { key: "mine", label: "My Tasks", count: openCount },
    { key: "created", label: "Created by Me" },
    { key: "open", label: "Open" },
    { key: "overdue", label: "Overdue", count: overdueCount, danger: true },
  ]

  // ── Selection ──
  const allChecked = sorted.length > 0 && sorted.every((t) => selected.has(t.id))
  const someChecked = selected.size > 0 && !allChecked
  const headerCheckRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (headerCheckRef.current) headerCheckRef.current.indeterminate = someChecked }, [someChecked])
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(sorted.map((t) => t.id)))
  const toggleRow = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  function bulkStatus(status: TaskStatus) {
    const ids = Array.from(selected)
    setTasks((prev) => prev.map((t) => selected.has(t.id) ? { ...t, status } : t))
    setSelected(new Set())
    run(() => bulkUpdateTasks(ids, { status }))
  }
  async function bulkDelete() {
    if (!(await confirmDialog(`Delete ${selected.size} task${selected.size !== 1 ? "s" : ""}? This cannot be undone.`))) return
    const ids = Array.from(selected)
    setTasks((prev) => prev.filter((t) => !selected.has(t.id)))
    setSelected(new Set())
    run(() => bulkDeleteTasks(ids))
  }

  // ── Saved views ──
  const [appliedViewId, setAppliedViewId] = useState<string | null>(null)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [newViewName, setNewViewName] = useState("")
  const [newViewAccess, setNewViewAccess] = useState<ViewAccessValue>({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
  const [savingView, setSavingView] = useState(false)
  const activeView = savedViews.find((v) => v.id === appliedViewId)
  const viewDirty = !!activeView && JSON.stringify({ filter, columns: visibleCols, frozen: frozenCount, viewMode }) !== JSON.stringify({ filter: activeView.config.filter ?? emptyFilter(), columns: activeView.config.columns ?? DEFAULT_TASK_COLS, frozen: activeView.config.frozen ?? 0, viewMode: activeView.config.viewMode ?? "table" })
  function applyView(v: SavedTaskView) {
    setFilter(v.config.filter ?? emptyFilter())
    applyCols(v.config.columns ?? DEFAULT_TASK_COLS, v.config.frozen ?? 0)
    setViewMode(v.config.viewMode ?? "table")
    setAppliedViewId(v.id)
  }
  function applyDefaultView() { setFilter(emptyFilter()); applyCols(DEFAULT_TASK_COLS, 0); setAppliedViewId(null) }
  function saveNewView() {
    if (!newViewName.trim()) return
    setSavingView(true)
    startTransition(async () => {
      await createTaskView(newViewName.trim(), { filter, columns: visibleCols, frozen: frozenCount, viewMode }, newViewAccess)
      setSavingView(false); setShowSaveForm(false); setNewViewName(""); setNewViewAccess({ visibility: "PRIVATE", teamId: null, sharedUserIds: [] })
      window.location.reload()
    })
  }
  function updateActiveView() {
    if (!appliedViewId) return
    setSavingView(true)
    startTransition(async () => { await updateTaskView(appliedViewId, { filter, columns: visibleCols, frozen: frozenCount, viewMode }); setSavingView(false) })
  }
  function removeView(id: string) { startTransition(async () => { await deleteTaskView(id); window.location.reload() }) }

  const toDefaults = (t: Task): Partial<FormValues> => ({
    title: t.title, description: t.description ?? "", dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : "",
    priority: t.priority, status: t.status, type: t.type, repeat: t.repeat, reminderMinutesBefore: t.reminderMinutesBefore,
    queueId: t.queue?.id ?? "", assignedToId: t.assignedTo?.id ?? "", associations: t.associations,
  })
  const payloadOf = (d: FormValues) => ({
    title: d.title, description: d.description, dueDate: d.dueDate || undefined, priority: d.priority,
    status: d.status, type: d.type, repeat: d.repeat, reminderMinutesBefore: d.reminderMinutesBefore,
    queueId: d.queueId || undefined, assignedToId: d.assignedToId || undefined,
    associations: d.associations.map((a) => ({ type: a.type, id: a.id })),
  })

  // ── Inline-edit resolver ──
  function taskEditable(t: Task, key: string): { def: RecordFieldDef; value: any; field: string; read?: React.ReactNode; owner?: boolean; status?: boolean } | null {
    if (key.startsWith("cp_")) {
      const id = key.slice(3); const p = cpById[id] as any; if (!p) return null
      return { def: cpToFieldDef(p, key), value: t.customProperties?.[id], field: key }
    }
    switch (key) {
      case "title": return { def: { key: "title", label: "Title", type: "text" }, value: t.title, field: "title" }
      case "status": {
        const s = stageMeta(t.status)
        return { def: { key: "status", label: "Stage", type: "select", options: TASK_STAGES.map((x) => x.value), optionLabels: Object.fromEntries(TASK_STAGES.map((x) => [x.value, x.label])) }, value: t.status, field: "status", status: true, read: <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", s.pill)}>{s.label}</span> }
      }
      case "type": return { def: { key: "type", label: "Type", type: "select", options: TASK_TYPES.map((x) => x.value), optionLabels: Object.fromEntries(TASK_TYPES.map((x) => [x.value, x.label])) }, value: t.type, field: "type", read: <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{typeLabel(t.type)}</span> }
      case "priority": return { def: { key: "priority", label: "Priority", type: "select", options: Object.keys(PRIORITY_LABELS), optionLabels: PRIORITY_LABELS }, value: t.priority, field: "priority", read: <span className="inline-flex items-center gap-1 text-xs text-slate-600"><span className={cn("h-1.5 w-1.5 rounded-full", PRIORITY_DOT[t.priority])} />{PRIORITY_LABELS[t.priority]}</span> }
      case "dueDate": return { def: { key: "dueDate", label: "Due Date", type: "datetime" }, value: t.dueDate, field: "dueDate" }
      case "repeat": return { def: { key: "repeat", label: "Repeat", type: "select", options: TASK_REPEATS.map((x) => x.value), optionLabels: Object.fromEntries(TASK_REPEATS.map((x) => [x.value, x.label])) }, value: t.repeat, field: "repeat" }
      case "assignedTo": return { def: { key: "assignedTo", label: "Assigned To", type: "user" }, value: t.assignedTo?.id ?? "", field: "assignedToId", owner: true }
      default: return null
    }
  }
  function renderTaskCell(t: Task, key: string): React.ReactNode {
    if (assocByKey[key]) { const v = readAssocValue(t, assocByKey[key]); return v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-300">—</span> }
    if (key.startsWith("cp_")) {
      const raw = t.customProperties?.[key.slice(3)]
      if (raw == null || raw === "") return <span className="text-slate-300">—</span>
      return <span className="text-slate-600">{Array.isArray(raw) ? raw.join(", ") : String(raw)}</span>
    }
    switch (key) {
      case "queue": return <span className="text-slate-500">{t.queue?.name ?? "—"}</span>
      case "associations": return t.associations.length
        ? <span className="flex flex-wrap gap-1">{t.associations.map((a) => <Link key={`${a.type}:${a.id}`} href={a.url} className="text-xs text-blue-600 hover:underline">{a.name}</Link>)}</span>
        : <span className="text-slate-300">—</span>
      case "reminder": return <span className="text-slate-500">{reminderLabel(t.reminderMinutesBefore)}</span>
      case "createdBy": return <span className="text-slate-500">{t.createdBy.name ?? t.createdBy.email}</span>
      case "created": return <span className="text-slate-500">{new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      default: return null
    }
  }

  function buildExport() {
    const headers = ["Title", ...colReorder.order.map((c) => c.label)]
    const rows = sorted.map((t) => [t.title, ...colReorder.order.map((c) => {
      const k = c.key
      if (assocByKey[k]) return readAssocValue(t, assocByKey[k])
      if (k.startsWith("cp_")) { const v = t.customProperties?.[k.slice(3)]; return Array.isArray(v) ? v.join("; ") : (v ?? "") }
      if (k === "status") return stageMeta(t.status).label
      if (k === "type") return typeLabel(t.type)
      if (k === "priority") return PRIORITY_LABELS[t.priority]
      if (k === "dueDate") return t.dueDate ? fmtDue(t.dueDate) : ""
      if (k === "assignedTo") return t.assignedTo ? (t.assignedTo.name || t.assignedTo.email) : ""
      if (k === "queue") return t.queue?.name ?? ""
      if (k === "associations") return t.associations.map((a) => a.name).join("; ")
      if (k === "reminder") return reminderLabel(t.reminderMinutesBefore)
      if (k === "repeat") return t.repeat
      if (k === "createdBy") return t.createdBy.name ?? t.createdBy.email
      if (k === "created") return new Date(t.createdAt).toLocaleDateString()
      return ""
    })])
    return { headers, rows }
  }

  const pill = "inline-flex items-center gap-1 h-8 rounded-lg border text-sm font-medium transition-all overflow-hidden px-3"
  const activeCls = "bg-blue-600 text-white border-blue-600"
  const idleCls = "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={applyDefaultView} className={cn(pill, !appliedViewId ? activeCls : idleCls)}>Default</button>
        {savedViews.map((v) => (
          <div key={v.id} className={cn(pill, "gap-0", appliedViewId === v.id ? activeCls : idleCls)}>
            <button className="pl-1 pr-1.5 h-full" onClick={() => applyView(v)}>
              {v.name}
              {v.isOwner === false && v.visibility && v.visibility !== "PRIVATE" && (
                <span className="ml-1.5 opacity-60">{v.visibility === "EVERYONE" ? <Globe className="inline h-3 w-3" /> : v.visibility === "TEAM" ? <Users className="inline h-3 w-3" /> : <UserCog className="inline h-3 w-3" />}</span>
              )}
            </button>
            {v.isOwner !== false && <button onClick={() => removeView(v.id)} title="Delete view" className={cn("pr-1 pl-0.5 h-full", appliedViewId === v.id ? "hover:text-zinc-200" : "hover:text-red-500")}><X className="h-3 w-3" /></button>}
          </div>
        ))}
        {viewDirty && (
          <button onClick={updateActiveView} disabled={savingView} className="h-8 px-3 rounded-lg text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5">
            {savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save changes
          </button>
        )}
        <div className="relative">
          <button onClick={() => setShowSaveForm((s) => !s)} className="h-8 px-3 rounded-lg text-sm border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-500 hover:text-zinc-600 flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> {viewDirty ? "Save as new" : "Save view"}</button>
          {showSaveForm && (
            <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
              <p className="text-xs text-slate-500">Saves the current filters, columns, and view.</p>
              <input autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveNewView(); if (e.key === "Escape") setShowSaveForm(false) }} placeholder="View name…" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg outline-none focus:border-slate-400" />
              <ViewAccessSelector value={newViewAccess} onChange={setNewViewAccess} users={shareUsers} teams={shareTeams} />
              <div className="flex gap-2 pt-1">
                <button onClick={saveNewView} disabled={savingView || !newViewName.trim()} className="flex-1 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5">{savingView ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save</button>
                <button onClick={() => { setShowSaveForm(false); setNewViewName("") }} className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setQuick(f.key)}
              className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors", quick === f.key ? (f.danger ? "bg-red-500 text-white" : "bg-blue-600 text-white") : (f.danger && (f.count ?? 0) > 0) ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
              {f.label}
              {f.count !== undefined && f.count > 0 && <span className={cn("text-xs rounded-full px-1.5 py-0.5 font-semibold", quick === f.key ? "bg-white/20" : f.danger ? "bg-red-500 text-white" : "bg-blue-100 text-blue-700")}>{f.count}</span>}
            </button>
          ))}
          <FilterBuilder fields={filterFields} value={filter} onChange={setFilter} />
          {filtersActive && <span className="text-xs text-slate-400">{filtered.length} of {tasks.length}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
            <button onClick={() => setViewMode("cards")} title="Cards" className={cn("inline-flex items-center justify-center h-7 w-8 rounded-md", viewMode === "cards" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}><LayoutList className="h-3.5 w-3.5" /></button>
            <button onClick={() => setViewMode("table")} title="Table" className={cn("inline-flex items-center justify-center h-7 w-8 rounded-md", viewMode === "table" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}><Table2 className="h-3.5 w-3.5" /></button>
          </div>
          {viewMode === "table" && (
            <button onClick={() => setColModalOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400"><Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" /></button>
          )}
          <button onClick={() => setExportOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400"><Download className="h-3.5 w-3.5" /> Export</button>
          {canManage && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Create task</Button>}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button className={bulkBtn} onClick={() => bulkStatus("COMPLETED")}>Mark complete</button>
          <button className={bulkBtn} onClick={() => bulkStatus("NOT_STARTED")}>Mark not started</button>
          {canDelete && <button className={bulkDanger} onClick={bulkDelete}>Delete</button>}
        </BulkActionBar>
      )}

      {/* ── Table view ── */}
      {viewMode === "table" ? (
        sorted.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white border rounded-lg">No tasks here. <button className="text-blue-600 hover:underline" onClick={() => setCreateOpen(true)}>Create one</button>.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col style={{ width: widthOf("title") }} />
                  {colReorder.order.map((c) => <col key={c.key} style={{ width: widthOf(c.key) }} />)}
                </colgroup>
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th style={cbFrozen ? { position: "sticky", left: 0, zIndex: 11 } : undefined} className={cn("px-3 py-2", cbFrozen && "bg-slate-50")}><input ref={headerCheckRef} type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded border-slate-300 cursor-pointer" /></th>
                    <th style={frozenHeadStyle(fmap.get("title"))} className={cn("px-3 py-2 font-semibold relative overflow-hidden", frozenClass(fmap.get("title"), "bg-slate-50"))}><button onClick={() => toggleSort("title")} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800"><span className="flex-1 min-w-0 truncate text-left">Title</span><SortIcon k="title" /></button><ColResizer onMouseDown={(e) => startResize("title", e)} /></th>
                    {colReorder.order.map((c) => (
                      <th key={c.key} {...colReorder.handleProps(c.key)} {...colReorder.cardProps(c.key)} style={frozenHeadStyle(fmap.get(c.key))}
                        className={cn("px-3 py-2 font-semibold relative overflow-hidden cursor-grab active:cursor-grabbing transition-colors", colReorder.dragging === c.key ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(fmap.get(c.key), "bg-slate-50")))}>
                        {c.sortable ? <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800"><span className="flex-1 min-w-0 truncate text-left">{c.label}</span><SortIcon k={c.key} /></button> : <span className="block truncate">{c.label}</span>}
                        <ColResizer onMouseDown={(e) => startResize(c.key, e)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((t) => (
                    <tr key={t.id} className={cn("transition-colors", selected.has(t.id) ? "bg-blue-50" : t.id === highlight ? "bg-amber-50" : "hover:bg-slate-50")}>
                      <td style={cbFrozen ? { position: "sticky", left: 0, zIndex: 10 } : undefined} className={cn("px-3 py-2.5", cbFrozen && "bg-white")}><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleRow(t.id)} className="rounded border-slate-300 cursor-pointer" /></td>
                      {(() => { const ed = canManage ? taskEditable(t, "title") : null; return (
                        <td style={{ maxWidth: widthOf("title"), ...frozenCellStyle(fmap.get("title")) }} className={cn(ed ? "p-0 align-middle" : "px-3 py-2.5 truncate font-medium text-slate-900", frozenClass(fmap.get("title")))}>
                          {ed ? <EditableCell def={ed.def} value={ed.value} canEdit={canManage} onSave={(v) => updateRecordField("TASK", t.id, "title", v)} /> : <span className="font-medium text-slate-900">{t.title}</span>}
                        </td>
                      )})()}
                      {colReorder.order.map((c) => {
                        const ed = canManage ? taskEditable(t, c.key) : null
                        return (
                          <td key={c.key} style={{ maxWidth: widthOf(c.key), ...frozenCellStyle(fmap.get(c.key)) }} className={cn(ed ? "p-0 align-middle" : "px-3 py-2.5 truncate text-slate-600", frozenClass(fmap.get(c.key)))}>
                            {ed
                              ? <EditableCell def={ed.def} value={ed.value} values={t.customProperties ?? {}} canEdit={canManage} renderRead={ed.read}
                                  users={ed.owner ? assignableUsers : undefined} userMap={ed.owner ? ownerUserMap : undefined}
                                  onSaveOwner={ed.owner ? (uid) => setRecordOwner("TASK", t.id, uid) : undefined}
                                  onSave={ed.owner ? ((uid) => setRecordOwner("TASK", t.id, uid as any)) : ed.status ? ((v) => updateTaskStatus(t.id, v as TaskStatus).then(() => undefined)) : ((v) => updateRecordField("TASK", t.id, ed.field, v))} />
                              : renderTaskCell(t, c.key)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-2">
          {sorted.length === 0 ? (
            <div className="text-center py-10 text-slate-400 bg-white border rounded-lg">No tasks here. <button className="text-blue-600 hover:underline" onClick={() => setCreateOpen(true)}>Create one</button>.</div>
          ) : sorted.map((t) => (
            <TaskRow key={t.id} task={t} currentUserId={currentUserId} onStatusChange={handleStatusChange} onEdit={setEditTask} onDelete={handleDelete} highlighted={t.id === highlight} />
          ))}
        </div>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject="tasks" defaultName="tasks" getData={buildExport} />

      <ColumnChooserModal open={colModalOpen} onClose={() => setColModalOpen(false)} columns={[{ key: "title", label: "Title" }, ...allTaskCols]} required={["title"]} selected={visibleCols} frozen={frozenCount} onApply={(sel, fr) => { applyCols(sel.filter((k) => k !== "title"), fr) }} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <TaskForm users={users} queues={queues} objectTypes={objectTypes} isPending={isPending} submitLabel="Create Task" onClose={() => setCreateOpen(false)} onSubmit={async (d) => { run(() => createTask(payloadOf(d))); setCreateOpen(false) }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <TaskForm users={users} queues={queues} objectTypes={objectTypes} defaultValues={toDefaults(editTask)} isPending={isPending} submitLabel="Save Changes" onClose={() => setEditTask(null)} onSubmit={async (d) => { run(() => updateTask(editTask.id, payloadOf(d))); setEditTask(null) }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
