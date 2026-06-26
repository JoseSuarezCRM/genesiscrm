import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { TaskStatus, TaskPriority } from "@prisma/client"
import { userCanLevel } from "@/lib/permissions"
import TasksClient from "@/components/tasks-client"

export default async function TasksPage({ searchParams }: { searchParams: { filter?: string; highlight?: string } }) {
  const session = await auth()
  const userId = session!.user.id

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        referral: { select: { id: true, patientFirstName: true, patientLastName: true } },
      },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-500">{tasks.filter(t => t.status !== TaskStatus.DONE).length} open</p>
      </div>
      <TasksClient
        tasks={tasks}
        users={users}
        currentUserId={userId}
        highlight={searchParams.highlight}
        initialFilter={searchParams.filter}
        canManage={userCanLevel(session?.user as any, "TASKS", "EDIT")}
      />
    </div>
  )
}
