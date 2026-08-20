"use client"

import { useState } from "react"
import { SubTabs } from "@/components/scheduling-v2/shared"
import ClinicAnalysis from "@/components/scheduling-v2/growth/clinics"
import Utilization from "@/components/scheduling-v2/growth/utilization"
import Revenue from "@/components/scheduling-v2/growth/revenue"
import InternRoi from "@/components/scheduling-v2/growth/roi"
import Projection from "@/components/scheduling-v2/growth/projection"
import Hiring from "@/components/scheduling-v2/growth/hiring"

const TABS = [
  { key: "clinics", label: "Clinic Analysis" },
  { key: "utilization", label: "Provider Utilization" },
  { key: "revenue", label: "Revenue Model" },
  { key: "internroi", label: "Intern Pipeline" },
  { key: "timeline", label: "Projection" },
  { key: "hiring", label: "Hiring" },
]

export default function GrowthPage() {
  const [tab, setTab] = useState("clinics")
  return (
    <div className="section">
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "clinics" && <ClinicAnalysis />}
      {tab === "utilization" && <Utilization />}
      {tab === "revenue" && <Revenue />}
      {tab === "internroi" && <InternRoi />}
      {tab === "timeline" && <Projection />}
      {tab === "hiring" && <Hiring />}
    </div>
  )
}
