"use client"

import { useEffect, useState } from "react"
import { clinicToday, fmtShort } from "@/lib/scheduling/dates"

// The dashboard's page header: title on the left, today's date and a
// last-rendered stamp on the right.
//
// Both dates are rendered after mount. Today at the clinic and today on the
// server can be different calendar days, and emitting one on the server and the
// other on the client is a hydration mismatch.

export default function PlannerHeader() {
  const [today, setToday] = useState<string>("")
  const [updated, setUpdated] = useState<string>("")

  useEffect(() => {
    const t = clinicToday()
    setToday(t.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }))
    setUpdated("Last updated: " + fmtShort(new Date()))
  }, [])

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
      <h1 style={{ margin: 0 }}>Clinical Operations &amp; Management</h1>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>{today}</div>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>{updated}</span>
      </div>
    </div>
  )
}
