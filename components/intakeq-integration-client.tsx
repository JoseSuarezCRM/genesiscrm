"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import IntakeqIntegrationConfig from "@/components/intakeq-integration-config"
import IntakeqReferralReport from "@/components/intakeq-referral-report"
import type { IntegrationSettings, ReferralSourceReport } from "@/app/actions/intakeq"

export default function IntakeqIntegrationClient({ settings, report, canEdit }: {
  settings: IntegrationSettings
  report: ReferralSourceReport
  canEdit: boolean
}) {
  const [tab, setTab] = useState<"report" | "config">(settings.connected ? "report" : "config")
  const tabs: { id: "report" | "config"; label: string }[] = [
    { id: "report", label: "Report" },
    { id: "config", label: "Configuration" },
  ]

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id ? "border-blue-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "report" ? <IntakeqReferralReport initial={report} canEdit={canEdit} /> : <IntakeqIntegrationConfig settings={settings} />}
    </div>
  )
}
