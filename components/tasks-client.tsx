"use client"

import StyledSelect from "@/components/ui/styled-select"
import DatePicker from "@/components/ui/date-picker"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useState, useTransition, useEffect, useRef } from "react"
import { TaskStatus, TaskPriority, TaskType, TaskRepeat } from "@prisma/client"
import { createTask, updateTask, updateTaskStatus, deleteTask, createTaskQueue } from "@/app/actions/tasks"
import { searchAssociableRecords } from "@/app/actions/associations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  Plus, Pencil, Trash2, Loader2, CheckCircle2, Circle, AlertCircle, Search, X, Link2, Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  TASK_STAGES, stageMeta, TASK_TYPES, typeLabel, TASK_REPEATS,
  PRIORITY_LABELS, PRIORITY_DOT, REMINDER_OPTIONS, reminderLabel,
} from "@/lib/task-meta"

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
  createdAt: string | Date
}

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
      onSubmit={async (e) => { e.preventDefault(); if (!v.title.trim()) { setErr("Task title is required"); return } await onSubmit(v) }}
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
        <textarea
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Add description…"
          rows={3}
          className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
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

export default function TasksClient({ tasks: initialTasks, users, queues, objectTypes, currentUserId, highlight, initialFilter, canManage = true }: {
  tasks: Task[]
  users: User[]
  queues: Queue[]
  objectTypes: ObjectType[]
  currentUserId: string
  highlight?: string
  initialFilter?: string
  canManage?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState(initialFilter ?? "mine")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

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

  const filteredTasks = tasks.filter((t) => {
    if (filter === "mine") return t.assignedTo?.id === currentUserId || (!t.assignedTo && t.createdBy.id === currentUserId)
    if (filter === "created") return t.createdBy.id === currentUserId
    if (filter === "open") return t.status !== "COMPLETED"
    if (filter === "overdue") return t.dueDate && t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()
    return true
  })

  const openCount = tasks.filter((t) => t.status !== "COMPLETED" && (t.assignedTo?.id === currentUserId || (!t.assignedTo && t.createdBy.id === currentUserId))).length
  const overdueCount = tasks.filter((t) => t.dueDate && t.status !== "COMPLETED" && new Date(t.dueDate) < new Date()).length

  const FILTERS = [
    { key: "mine", label: "My Tasks", count: openCount },
    { key: "all", label: "All Tasks" },
    { key: "created", label: "Created by Me" },
    { key: "open", label: "Open" },
    { key: "overdue", label: "Overdue", count: overdueCount, danger: true },
  ]

  const toDefaults = (t: Task): Partial<FormValues> => ({
    title: t.title,
    description: t.description ?? "",
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : "",
    priority: t.priority,
    status: t.status,
    type: t.type,
    repeat: t.repeat,
    reminderMinutesBefore: t.reminderMinutesBefore,
    queueId: t.queue?.id ?? "",
    assignedToId: t.assignedTo?.id ?? "",
    associations: t.associations,
  })

  const payloadOf = (d: FormValues) => ({
    title: d.title, description: d.description, dueDate: d.dueDate || undefined, priority: d.priority,
    status: d.status, type: d.type, repeat: d.repeat, reminderMinutesBefore: d.reminderMinutesBefore,
    queueId: d.queueId || undefined, assignedToId: d.assignedToId || undefined,
    associations: d.associations.map((a) => ({ type: a.type, id: a.id })),
  })

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filter === f.key
                  ? f.danger ? "bg-red-500 text-white" : "bg-blue-600 text-white"
                  : f.danger && (f.count ?? 0) > 0
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {f.label}
              {f.count !== undefined && f.count > 0 && (
                <span className={cn("text-xs rounded-full px-1.5 py-0.5 font-semibold", filter === f.key ? "bg-white/20" : f.danger ? "bg-red-500 text-white" : "bg-blue-100 text-blue-700")}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Create task
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white border rounded-lg">
            No tasks here.{" "}
            <button className="text-blue-600 hover:underline" onClick={() => setCreateOpen(true)}>Create one</button>.
          </div>
        ) : (
          filteredTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              currentUserId={currentUserId}
              onStatusChange={handleStatusChange}
              onEdit={setEditTask}
              onDelete={handleDelete}
              highlighted={t.id === highlight}
            />
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <TaskForm
            users={users} queues={queues} objectTypes={objectTypes} isPending={isPending} submitLabel="Create Task"
            onClose={() => setCreateOpen(false)}
            onSubmit={async (d) => { run(() => createTask(payloadOf(d))); setCreateOpen(false) }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <TaskForm
              users={users} queues={queues} objectTypes={objectTypes} defaultValues={toDefaults(editTask)} isPending={isPending} submitLabel="Save Changes"
              onClose={() => setEditTask(null)}
              onSubmit={async (d) => { run(() => updateTask(editTask.id, payloadOf(d))); setEditTask(null) }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
