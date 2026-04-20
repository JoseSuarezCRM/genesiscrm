import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import AutomationManager from "@/components/automation-manager"

export default async function AutomationsPage() {
  const session = await auth()

  const [automations, users, tags, practices, locations] = await Promise.all([
    prisma.automation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true, email: true } },
        _count: { select: { runs: true } },
      },
    }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.referringPractice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.practiceLocation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Automations</h1>
        <p className="text-sm text-slate-500">{automations.filter((a: any) => a.isActive).length} active rule{automations.filter((a: any) => a.isActive).length !== 1 ? "s" : ""}</p>
      </div>
      <AutomationManager
        automations={automations as any}
        users={users}
        tags={tags}
        practices={practices}
        locations={locations}
        currentUserId={session!.user.id}
      />
    </div>
  )
}
