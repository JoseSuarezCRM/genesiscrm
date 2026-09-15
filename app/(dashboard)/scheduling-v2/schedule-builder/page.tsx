"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import FullSchedule from "@/components/scheduling-v2/builder/full-schedule"
import VisitCount from "@/components/scheduling-v2/builder/visits"
import PtoExceptions from "@/components/scheduling-v2/builder/pto"
import TaskAssignments from "@/components/scheduling-v2/builder/tasks"
import ABSchedule from "@/components/scheduling-v2/builder/ab-schedule"
import StaffingRules from "@/components/scheduling-v2/builder/staffing-rules"
import SurgeryLog from "@/components/scheduling-v2/builder/surgery-log"

const TABS = [
  { key: "admin", label: "Full Schedule" },
  { key: "visits", label: "Visit Count" },
  { key: "pto", label: "PTO / Exceptions" },
  { key: "tasks", label: "Task Assignments" },
  { key: "provsched", label: "Provider A/B" },
  { key: "staffrules", label: "Staffing Rules" },
  { key: "surgery", label: "Surgery Shadowing" },
]

export default function ScheduleBuilderPage() {
  const [tab, setTab] = useState("admin")
  return (
    <div className="section">
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "admin" && <FullSchedule />}
      {tab === "visits" && <VisitCount />}
      {tab === "pto" && <PtoExceptions />}
      {tab === "tasks" && <TaskAssignments />}
      {tab === "provsched" && <ABSchedule />}
      {tab === "staffrules" && <StaffingRules />}
      {tab === "surgery" && <SurgeryLog />}
    </div>
  )
}
