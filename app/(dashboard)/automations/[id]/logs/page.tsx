import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { getAutomationRuns } from "@/app/actions/automations"
import { workflowObjectFor, WORKFLOW_TRIGGER_LABELS } from "@/lib/workflow-objects"
import WorkflowLogsClient from "@/components/workflow-logs-client"

export default async function WorkflowLogsPage({ params }: { params: { id: string } }) {
  const automation = await prisma.automation.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, triggerType: true },
  })
  if (!automation) notFound()

  const runs = await getAutomationRuns(automation.id)
  const obj = workflowObjectFor(automation.triggerType)
  const triggerLabel = `${obj.label} · ${WORKFLOW_TRIGGER_LABELS[automation.triggerType] ?? automation.triggerType}`

  return (
    <WorkflowLogsClient
      automationId={automation.id}
      name={automation.name}
      triggerLabel={triggerLabel}
      initialRuns={runs as any}
    />
  )
}
