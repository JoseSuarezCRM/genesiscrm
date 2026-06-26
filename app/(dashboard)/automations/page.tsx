import { prisma } from "@/lib/prisma"
import { requireView } from "@/lib/auth-guard"
import AutomationManager from "@/components/automation-manager"

export default async function AutomationsPage() {
  await requireView("AUTOMATIONS")
  const automations = await prisma.automation.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { runs: true } },
    },
  })

  const activeCount = automations.filter((a) => a.isActive).length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Workflows</h1>
        <p className="text-sm text-slate-500">
          {activeCount} active workflow{activeCount !== 1 ? "s" : ""} · {automations.length} total
        </p>
      </div>
      <AutomationManager automations={automations as any} />
    </div>
  )
}
