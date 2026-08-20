"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import XrtPreferences from "@/components/scheduling-v2/xrt/preferences"
import XrtCalendar from "@/components/scheduling-v2/xrt/calendar"
import XrtFairness from "@/components/scheduling-v2/xrt/fairness"

const TABS = [
  { key: "preferences", label: "XRT Preferences" },
  { key: "results", label: "Assignment Calendar" },
  { key: "fairness", label: "Rotation Tracker" },
]

export default function XrtPage() {
  const [tab, setTab] = useState("preferences")
  return (
    <div className="section">
      <div className="callout" style={{ borderLeftColor: "#9a3412", background: "#fff7ed" }}>Auto-assign XR Techs to clinics that require X-ray coverage. Set preferences here, then enter volume in <strong>Schedule Builder → Visit Count</strong> to generate. Only clinics marked <strong>XR Need</strong> are eligible.</div>
      <SubTabs tabs={TABS} active={tab} onChange={setTab} accent="#9a3412" />
      {tab === "preferences" && <XrtPreferences />}
      {tab === "results" && <XrtCalendar />}
      {tab === "fairness" && <XrtFairness />}
    </div>
  )
}
