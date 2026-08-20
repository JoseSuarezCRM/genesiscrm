"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import VisitCount from "@/components/scheduling-v2/builder/visits"
import ABSchedule from "@/components/scheduling-v2/builder/ab-schedule"
import PtoExceptions from "@/components/scheduling-v2/builder/pto"
import TaskAssignments from "@/components/scheduling-v2/builder/tasks"
import StaffingRules from "@/components/scheduling-v2/builder/staffing-rules"
import MySchedule from "@/components/scheduling-v2/builder/my-schedule"
import Optimizer from "@/components/scheduling-v2/builder/optimizer"

const TABS = [
  { key: "visits", label: "Visit Count" },
  { key: "provsched", label: "🩺 Provider A/B Schedule" },
  { key: "pto", label: "☀ PTO / Exceptions" },
  { key: "tasks", label: "Task Assignments" },
  { key: "staffrules", label: "Staffing Rules" },
  { key: "myschedule", label: "My Schedule" },
  { key: "optimizer", label: "🤖 AI Optimizer" },
]

export default function ScheduleBuilderPage() {
  const [tab, setTab] = useState("visits")
  return (
    <div className="section">
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "visits" && <VisitCount />}
      {tab === "provsched" && <ABSchedule />}
      {tab === "pto" && <PtoExceptions />}
      {tab === "tasks" && <TaskAssignments />}
      {tab === "staffrules" && <StaffingRules />}
      {tab === "myschedule" && <MySchedule />}
      {tab === "optimizer" && <Optimizer />}
    </div>
  )
}
