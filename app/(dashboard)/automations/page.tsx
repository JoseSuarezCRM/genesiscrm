import { prisma } from "@/lib/prisma"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import AutomationManager from "@/components/automation-manager"

export default async function AutomationsPage() {
  const session = await requireView("AUTOMATIONS")
  const user = session?.user as any
  // View-only users get a read-only list — every write control is hidden rather
  // than left to fail against the same gate on the server action.
  const canEdit = userCanLevel(user, "AUTOMATIONS", "EDIT")
  const canDelete = userCanDelete(user, "AUTOMATIONS")

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
      <AutomationManager automations={automations as any} canEdit={canEdit} canDelete={canDelete} />
    </div>
  )
}
