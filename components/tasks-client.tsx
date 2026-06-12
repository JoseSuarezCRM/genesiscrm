"use client"

import StyledSelect from "@/components/ui/styled-select"
import { useState, useTransition, useEffect, useRef } from "react"
import { TaskStatus, TaskPriority } from "@prisma/client"
import { createTask, updateTask, updateTaskStatus, deleteTask } from "@/app/actions/tasks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Loader2, CheckCircle2, Circle, Clock, AlertCircle, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

// ─── Types ────────────────────────────────────────────────────────────────────

type User = { id: string; name: string | null; email: string }
type TaskReferral = { id: string; patientFirstName: string; patientLastName: string } | null
type Task = {
  id: string
  title: string
  description: string | null
  dueDate: Date | null
  priority: TaskPriority
  status: TaskStatus
  createdBy: User
  assignedTo: User | null
  referral: TaskReferral
  createdAt: Date
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" }
const PRIORITY_COLORS: Record<TaskPriority, string> = {
  LOW: "text-slate-400",
  NORMAL: "text-blue-500",
  HIGH: "text-amber-500",
  URGENT: "text-red-500",
}
const PRIORITY_BG: Record<TaskPriority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  NORMAL: "bg-blue-50 text-blue-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-red-50 text-red-700",
}
const STATUS_NEXT: Record<TaskStatus, TaskStatus> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "TODO",
}

// ─── Task Form ────────────────────────────────────────────────────────────────

function TaskForm({ users, defaultValues, onSubmit, isPending, onClose }: {
  users: User[]
  defaultValues?: Partial<{ title: string; description: string; dueDate: string; priority: TaskPriority; assignedToId: string }>
  onSubmit: (d: { title: string; description: string; dueDate: string; priority: TaskPriority; assignedToId: string }) => Promise<void>
  isPending: boolean
  onClose: () => void
}) {
  const [title, setTitle] = useState(defaultValues?.title ?? "")
  const [description, setDescription] = useState(defaultValues?.description ?? "")
  const [dueDate, setDueDate] = useState(defaultValues?.dueDate ?? "")
  const [priority, setPriority] = useState<TaskPriority>(defaultValues?.priority ?? "NORMAL")
  const [assignedToId, setAssignedToId] = useState(defaultValues?.assignedToId ?? "")
  const [err, setErr] = useState("")

  return (
    <form onSubmit={async (e) => {
      e.preventDefault()
      if (!title.trim()) { setErr("Title is required"); return }
      await onSubmit({ title, description, dueDate, priority, assignedToId })
    }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title *</Label>
        <Input value={title} onChange={e => { setTitle(e.target.value); setErr("") }} placeholder="What needs to be done?" />
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional details..."
          rows={3}
          className="flex w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Due Date</Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <StyledSelect value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
            className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            {Object.values(TaskPriority).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </StyledSelect>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Assign to</Label>
        <StyledSelect value={assignedToId} onChange={e => setAssignedToId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">— Unassigned —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
        </StyledSelect>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </DialogFooter>
    </form>
  )
}

// ─── Task Row ─────────────────────────────────────────────────────────────────

function TaskRow({ task, currentUserId, users, onStatusChange, onEdit, onDelete, highlighted }: {
  task: Task
  currentUserId: string
  users: User[]
  onStatusChange: (id: string, status: TaskStatus) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  highlighted: boolean
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const isDone = task.status === "DONE"
  const isOverdue = task.dueDate && !isDone && new Date(task.dueDate) < new Date()

  useEffect(() => {
    if (highlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [highlighted])

  return (
    <div
      ref={rowRef}
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        isDone ? "bg-slate-50 opacity-60" : "bg-white",
        highlighted && "ring-2 ring-blue-400 border-blue-300"
      )}
    >
      <button
        onClick={() => onStatusChange(task.id, STATUS_NEXT[task.status])}
        className="mt-0.5 shrink-0"
        title={`Mark as ${STATUS_NEXT[task.status].replace("_", " ").toLowerCase()}`}
      >
        {isDone
          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
          : task.status === "IN_PROGRESS"
          ? <Clock className="h-5 w-5 text-amber-500" />
          : <Circle className="h-5 w-5 text-slate-300 hover:text-slate-500" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-medium", isDone && "line-through text-slate-400")}>{task.title}</span>
          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", PRIORITY_BG[task.priority])}>{PRIORITY_LABELS[task.priority]}</span>
          {task.status === "IN_PROGRESS" && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">In Progress</span>}
        </div>
        {task.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {task.referral && (
            <Link href={`/referrals/${task.referral.id}`} className="text-xs text-blue-600 hover:underline">
              {task.referral.patientFirstName} {task.referral.patientLastName}
            </Link>
          )}
          {task.dueDate && (
            <span className={cn("text-xs flex items-center gap-1", isOverdue ? "text-red-500 font-medium" : "text-slate-400")}>
              {isOverdue && <AlertCircle className="h-3 w-3" />}
              Due {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {task.assignedTo
              ? `→ ${task.assignedTo.id === currentUserId ? "You" : (task.assignedTo.name || task.assignedTo.email)}`
              : "Unassigned"}
          </span>
          <span className="text-xs text-slate-300">by {task.createdBy.id === currentUserId ? "You" : (task.createdBy.name || task.createdBy.email)}</span>
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

export default function TasksClient({ tasks: initialTasks, users, currentUserId, highlight, initialFilter }: {
  tasks: Task[]
  users: User[]
  currentUserId: string
  highlight?: string
  initialFilter?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState(initialFilter ?? "mine")
  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Sync if server revalidates
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])

  function run(fn: () => Promise<{ success?: boolean; error?: unknown } | undefined>) {
    startTransition(async () => {
      const r = await fn()
      if (r?.error) setError(typeof r.error === "string" ? r.error : "Something went wrong.")
    })
  }

  function handleStatusChange(id: string, status: TaskStatus) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    run(() => updateTaskStatus(id, status))
  }

  function handleDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    run(() => deleteTask(id))
  }

  const filteredTasks = tasks.filter(t => {
    if (filter === "mine") return t.assignedTo?.id === currentUserId || (!t.assignedTo && t.createdBy.id === currentUserId)
    if (filter === "created") return t.createdBy.id === currentUserId
    if (filter === "open") return t.status !== "DONE"
    if (filter === "overdue") return t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date()
    return true // "all"
  })

  const openCount = tasks.filter(t => t.status !== "DONE" && (t.assignedTo?.id === currentUserId || (!t.assignedTo && t.createdBy.id === currentUserId))).length
  const overdueCount = tasks.filter(t => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date()).length

  const FILTERS = [
    { key: "mine", label: "My Tasks", count: openCount },
    { key: "all", label: "All Tasks" },
    { key: "created", label: "Created by Me" },
    { key: "open", label: "Open" },
    { key: "overdue", label: "Overdue", count: overdueCount, danger: true },
  ]

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
          {error} <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
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

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Task
        </Button>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-10 text-slate-400 bg-white border rounded-lg">
            No tasks here.{" "}
            <button className="text-blue-600 hover:underline" onClick={() => setCreateOpen(true)}>Create one</button>.
          </div>
        ) : (
          filteredTasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              currentUserId={currentUserId}
              users={users}
              onStatusChange={handleStatusChange}
              onEdit={setEditTask}
              onDelete={handleDelete}
              highlighted={t.id === highlight}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <TaskForm
            users={users}
            isPending={isPending}
            onClose={() => setCreateOpen(false)}
            onSubmit={async (d) => {
              run(() => createTask({ ...d, assignedToId: d.assignedToId || undefined }))
              setCreateOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTask} onOpenChange={o => !o && setEditTask(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <TaskForm
              users={users}
              defaultValues={{
                title: editTask.title,
                description: editTask.description ?? "",
                dueDate: editTask.dueDate ? new Date(editTask.dueDate).toISOString().slice(0, 10) : "",
                priority: editTask.priority,
                assignedToId: editTask.assignedTo?.id ?? "",
              }}
              isPending={isPending}
              onClose={() => setEditTask(null)}
              onSubmit={async (d) => {
                run(() => updateTask(editTask.id, { ...d, assignedToId: d.assignedToId || undefined }))
                setEditTask(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
