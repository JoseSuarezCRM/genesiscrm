import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import { getAutomationRuns } from "@/app/actions/automations"
import { workflowObjectFor } from "@/components/automation-manager"
import WorkflowLogsClient from "@/components/workflow-logs-client"

const TRIGGER_LABELS: Record<string, string> = {
  REFERRAL_CREATED: "New referral created",
  REFERRAL_STATUS_CHANGED: "Referral status changed",
  SURGERY_STATUS_CHANGED: "Surgery case status changed",
  SURGERY_CALL_ATTEMPTS_REACHED: "Surgery call attempts reached",
  EMBED_REFERRAL_RECEIVED: "Referral received via embed form",
}

export default async function WorkflowLogsPage({ params }: { params: { id: string } }) {
  const automation = await prisma.automation.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, triggerType: true },
  })
  if (!automation) notFound()

  const runs = await getAutomationRuns(automation.id)
  const obj = workflowObjectFor(automation.triggerType)
  const triggerLabel = `${obj.label} · ${TRIGGER_LABELS[automation.triggerType] ?? automation.triggerType}`

  return (
    <WorkflowLogsClient
      automationId={automation.id}
      name={automation.name}
      triggerLabel={triggerLabel}
      initialRuns={runs as any}
    />
  )
}
