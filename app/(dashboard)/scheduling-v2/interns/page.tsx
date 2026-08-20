"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import InternPreferences from "@/components/scheduling-v2/interns/preferences"
import InternCalendar from "@/components/scheduling-v2/interns/calendar"
import InternFairness from "@/components/scheduling-v2/interns/fairness"
import SurgeryShadowing from "@/components/scheduling-v2/interns/surgery"
import InternGantt from "@/components/scheduling-v2/interns/gantt"

const TABS = [
  { key: "preferences", label: "Clinic Preferences" },
  { key: "results", label: "Assignment Calendar" },
  { key: "fairness", label: "Rotation Tracker" },
  { key: "surgery", label: "🔪 Surgery Shadowing" },
  { key: "gantt", label: "📈 Intern Transition" },
]

export default function InternsPage() {
  const [tab, setTab] = useState("preferences")
  return (
    <div className="section">
      <div className="callout">Auto-assign interns to clinics based on preference rankings and patient volume. Set preferences here, then enter volume in <strong>Schedule Builder → Visit Count</strong> to generate assignments.</div>
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "preferences" && <InternPreferences />}
      {tab === "results" && <InternCalendar />}
      {tab === "fairness" && <InternFairness />}
      {tab === "surgery" && <SurgeryShadowing />}
      {tab === "gantt" && <InternGantt />}
    </div>
  )
}
