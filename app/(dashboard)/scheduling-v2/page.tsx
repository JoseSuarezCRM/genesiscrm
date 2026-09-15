"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import StaffView from "@/components/scheduling-v2/master/staff-view"
import MySchedule from "@/components/scheduling-v2/master/my-schedule"

// Master Schedule is the planner's landing section — the read-only view the
// clinic checks, not the one operations edits.

const TABS = [
  { key: "clean", label: "Staff View" },
  { key: "myschedule", label: "My Schedule" },
]

export default function MasterSchedulePage() {
  const [tab, setTab] = useState("clean")
  return (
    <div className="section">
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "clean" ? <StaffView /> : <MySchedule />}
    </div>
  )
}
