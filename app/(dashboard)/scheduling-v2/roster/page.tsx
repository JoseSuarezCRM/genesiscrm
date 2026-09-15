"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import RosterTable from "@/components/scheduling-v2/roster/roster-table"
import ManageClinics from "@/components/scheduling-v2/roster/manage-clinics"

const TABS = [
  { key: "roster", label: "Roster" },
  { key: "clinicmgmt", label: "Manage Clinics" },
]

export default function RosterPage() {
  const [tab, setTab] = useState("roster")
  return (
    <div className="section">
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "roster" ? <RosterTable /> : <ManageClinics />}
    </div>
  )
}
