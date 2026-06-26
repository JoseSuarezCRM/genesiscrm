"use server"

import { requireAccess, requireDelete } from "@/lib/auth-guard"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { TaskPriority, TaskStatus } from "@prisma/client"

const TaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default("NORMAL"),
  assignedToId: z.string().optional(),
  referralId: z.string().optional(),
})

export async function createTask(data: unknown) {
  await requireAccess("TASKS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = TaskSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { dueDate, assignedToId, referralId, ...rest } = parsed.data

  const task = await prisma.task.create({
    data: {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdById: session.user.id,
      assignedToId: assignedToId || null,
      referralId: referralId || null,
    },
  })

  // Notify the assignee (if different from creator)
  if (assignedToId && assignedToId !== session.user.id) {
    const referral = referralId ? await prisma.referral.findUnique({ where: { id: referralId }, select: { patientFirstName: true, patientLastName: true } }) : null
    const suffix = referral ? ` for ${referral.patientFirstName} ${referral.patientLastName}` : ""
    await prisma.notification.create({
      data: {
        userId: assignedToId,
        type: "TASK_ASSIGNED",
        message: `You were assigned a task: "${rest.title}"${suffix}`,
        link: `/tasks?highlight=${task.id}`,
        taskId: task.id,
      },
    })
  }

  revalidatePath("/tasks")
  return { success: true, id: task.id }
}

export async function updateTask(id: string, data: unknown) {
  await requireAccess("TASKS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = TaskSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors }

  const { dueDate, assignedToId, referralId, ...rest } = parsed.data

  const existing = await prisma.task.findUnique({ where: { id }, select: { assignedToId: true, title: true, referralId: true } })
  if (!existing) return { error: "Task not found" }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : null,
      assignedToId: assignedToId || null,
      referralId: referralId || null,
    },
  })

  // Notify new assignee if changed
  const newAssignee = assignedToId || null
  if (newAssignee && newAssignee !== existing.assignedToId && newAssignee !== session.user.id) {
    const refId = referralId || existing.referralId
    const referral = refId ? await prisma.referral.findUnique({ where: { id: refId }, select: { patientFirstName: true, patientLastName: true } }) : null
    const suffix = referral ? ` for ${referral.patientFirstName} ${referral.patientLastName}` : ""
    await prisma.notification.create({
      data: {
        userId: newAssignee,
        type: "TASK_ASSIGNED",
        message: `You were assigned a task: "${rest.title}"${suffix}`,
        link: `/tasks?highlight=${id}`,
        taskId: id,
      },
    })
  }

  revalidatePath("/tasks")
  return { success: true }
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  await requireAccess("TASKS", "EDIT")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.task.update({ where: { id }, data: { status } })
  revalidatePath("/tasks")
  return { success: true }
}

export async function deleteTask(id: string) {
  await requireDelete("TASKS")
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  await prisma.task.delete({ where: { id } })
  revalidatePath("/tasks")
  return { success: true }
}
