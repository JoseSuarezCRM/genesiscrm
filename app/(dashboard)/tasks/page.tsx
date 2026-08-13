import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import TasksClient from "@/components/tasks-client"
import { listTaskQueues } from "@/app/actions/tasks"
import { listObjectTypes } from "@/lib/object-registry"
import { loadTaskAssociations } from "@/lib/task-associations"

export default async function TasksPage({ searchParams }: { searchParams: { filter?: string; highlight?: string } }) {
  const session = await requireView("TASKS")
  const userId = session!.user.id

  const [tasks, users, queues, objectTypes] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        queue: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    listTaskQueues(),
    listObjectTypes(),
  ])

  const assocMap = await loadTaskAssociations(tasks.map((t) => t.id))
  const tasksWithAssoc = tasks.map((t) => ({ ...t, associations: assocMap.get(t.id) ?? [] }))

  const openCount = tasks.filter((t) => t.status !== "COMPLETED").length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-500">{openCount} open</p>
      </div>
      <TasksClient
        tasks={tasksWithAssoc as any}
        users={users}
        queues={queues}
        objectTypes={objectTypes}
        currentUserId={userId}
        highlight={searchParams.highlight}
        initialFilter={searchParams.filter}
        canManage={userCanLevel(session?.user as any, "TASKS", "EDIT")}
      />
    </div>
  )
}
