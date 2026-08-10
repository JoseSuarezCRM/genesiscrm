"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import IntakeqIntegrationConfig from "@/components/intakeq-integration-config"
import IntakeqIntegrationActivity from "@/components/intakeq-integration-activity"
import IntakeqReferralReport from "@/components/intakeq-referral-report"
import type { IntegrationSettings, ReferralSourceReport, IntegrationActivity, IntakeSubmission } from "@/app/actions/intakeq"

type TabId = "report" | "activity" | "config"

export default function IntakeqIntegrationClient({ settings, report, activity, submissions, canEdit }: {
  settings: IntegrationSettings
  report: ReferralSourceReport
  activity: IntegrationActivity
  submissions: IntakeSubmission[]
  canEdit: boolean
}) {
  const [tab, setTab] = useState<TabId>(settings.connected ? "report" : "config")
  const tabs: { id: TabId; label: string }[] = [
    { id: "report", label: "Report" },
    { id: "activity", label: "Activity" },
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
      {tab === "report" && <IntakeqReferralReport initial={report} canEdit={canEdit} />}
      {tab === "activity" && <IntakeqIntegrationActivity activity={activity} submissions={submissions} />}
      {tab === "config" && <IntakeqIntegrationConfig settings={settings} />}
    </div>
  )
}
