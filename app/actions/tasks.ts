"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { TaskPriority, TaskStatus, TaskType, TaskRepeat } from "@prisma/client"
import { nextRepeatDate } from "@/lib/task-meta"

const AssocInput = z.object({ type: z.string(), id: z.string() })

const TaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default("NORMAL"),
  status: z.nativeEnum(TaskStatus).default("NOT_STARTED"),
  type: z.nativeEnum(TaskType).default("TODO"),
  repeat: z.nativeEnum(TaskRepeat).default("NONE"),
  reminderMinutesBefore: z.coerce.number().int().min(0).nullable().optional(),
  queueId: z.string().optional(),
  assignedToId: z.string().optional(),
  associations: z.array(AssocInput).optional(),
})

// Replace a task's object associations (stored as objectAssociation rows with
// fromType "TASK") with the given set.
async function syncTaskAssociations(taskId: string, associations: { type: string; id: string }[]) {
  await (prisma as any).objectAssociation.deleteMany({
    where: { OR: [{ fromType: "TASK", fromId: taskId }, { toType: "TASK", toId: taskId }] },
  })
  if (associations.length) {
    await (prisma as any).objectAssociation.createMany({
      data: associations.map((a) => ({ fromType: "TASK", fromId: taskId, toType: a.type, toId: a.id })),
    })
  }
}

async function notifyAssignee(assignedToId: string, title: string, taskId: string) {
  await prisma.notification.create({
    data: {
      userId: assignedToId,
      type: "TASK_ASSIGNED",
      message: `You were assigned a task: "${title}"`,
      link: `/tasks?highlight=${taskId}`,
      taskId,
    },
  })
}

export async function createTask(data: unknown) {
  await requireAccess("TASKS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = TaskSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { dueDate, assignedToId, queueId, associations = [], reminderMinutesBefore, ...rest } = parsed.data

  const task = await prisma.task.create({
    data: {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : null,
      reminderMinutesBefore: reminderMinutesBefore ?? null,
      queueId: queueId || null,
      createdById: session.user.id,
      assignedToId: assignedToId || null,
    },
  })

  await syncTaskAssociations(task.id, associations)

  if (assignedToId && assignedToId !== session.user.id) await notifyAssignee(assignedToId, rest.title, task.id)

  revalidatePath("/tasks")
  return { success: true, id: task.id }
}

export async function updateTask(id: string, data: unknown) {
  await requireAccess("TASKS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = TaskSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { dueDate, assignedToId, queueId, associations = [], reminderMinutesBefore, ...rest } = parsed.data

  const existing = await prisma.task.findUnique({ where: { id }, select: { assignedToId: true } })
  if (!existing) return { error: "Task not found" }

  await prisma.task.update({
    where: { id },
    data: {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : null,
      reminderMinutesBefore: reminderMinutesBefore ?? null,
      // Editing resets the sent flag so a moved due date / changed reminder fires again.
      reminderSentAt: null,
      queueId: queueId || null,
      assignedToId: assignedToId || null,
      updatedById: session.user.id,
    },
  })

  await syncTaskAssociations(id, associations)

  const newAssignee = assignedToId || null
  if (newAssignee && newAssignee !== existing.assignedToId && newAssignee !== session.user.id) {
    await notifyAssignee(newAssignee, rest.title, id)
  }

  revalidatePath("/tasks")
  return { success: true }
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  await requireAccess("TASKS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const task = await prisma.task.update({ where: { id }, data: { status, updatedById: session.user.id } })

  // Completing a repeating task spawns the next occurrence (its associations copied).
  if (status === "COMPLETED" && task.repeat !== "NONE") {
    const nextDue = task.dueDate ? nextRepeatDate(task.dueDate, task.repeat) : null
    const clone = await prisma.task.create({
      data: {
        title: task.title, description: task.description, priority: task.priority, type: task.type,
        repeat: task.repeat, reminderMinutesBefore: task.reminderMinutesBefore, queueId: task.queueId,
        dueDate: nextDue, createdById: task.createdById, assignedToId: task.assignedToId,
        status: "NOT_STARTED",
      },
    })
    const links = await (prisma as any).objectAssociation.findMany({
      where: { OR: [{ fromType: "TASK", fromId: id }, { toType: "TASK", toId: id }] },
    })
    if (links.length) {
      await (prisma as any).objectAssociation.createMany({
        data: links.map((l: any) => {
          const other = l.fromType === "TASK" ? { type: l.toType, id: l.toId } : { type: l.fromType, id: l.fromId }
          return { fromType: "TASK", fromId: clone.id, toType: other.type, toId: other.id }
        }),
      })
    }
  }

  revalidatePath("/tasks")
  return { success: true }
}

export async function deleteTask(id: string) {
  await requireDelete("TASKS")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await (prisma as any).objectAssociation.deleteMany({
    where: { OR: [{ fromType: "TASK", fromId: id }, { toType: "TASK", toId: id }] },
  })
  await prisma.task.delete({ where: { id } })
  revalidatePath("/tasks")
  return { success: true }
}

// ── Task queues ──────────────────────────────────────────────────────────────
export async function listTaskQueues() {
  return prisma.taskQueue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
}

export async function createTaskQueue(name: string) {
  await requireAccess("TASKS", "EDIT")
  const clean = name.trim()
  if (!clean) return { error: "Queue name is required" }
  const existing = await prisma.taskQueue.findUnique({ where: { name: clean } })
  if (existing) return { success: true, id: existing.id, name: existing.name }
  const q = await prisma.taskQueue.create({ data: { name: clean } })
  revalidatePath("/tasks")
  return { success: true, id: q.id, name: q.name }
}
