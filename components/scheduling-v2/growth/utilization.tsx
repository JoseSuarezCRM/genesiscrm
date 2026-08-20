"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { IA_CLINIC_COLORS, DAYS } from "@/lib/scheduling/constants"
import { monday, d } from "@/lib/scheduling/dates"
import { providerActive, chipTextColor } from "@/lib/scheduling/providers"
import { recentAvg } from "@/lib/scheduling/volume"

export default function Utilization() {
  const { data } = useScheduling()
  const [base, setBase] = useState<"A" | "B">("A")
  const target = +data.settings.targetPts || 30
  const dpm = +data.settings.daysPerMonth || 21
  const sched = base === "B" ? data.scheduleB : data.scheduleA

  const provData = data.providers.map((p) => {
    let scheduledDays = 0
    const clinicBreakdown: Record<string, number> = {}
    let surgDays = 0
    for (const code of data.clinicOrder) {
      const s = sched[code] || {}
      for (const day of DAYS) {
        if ((s[day] || []).includes(p.init)) {
          if (data.clinicMeta[code]?.isSurgery) surgDays++
          else { scheduledDays++; clinicBreakdown[code] = (clinicBreakdown[code] || 0) + 1 }
        }
      }
    }
    const weeklyCapacity = scheduledDays * p.ptsDay
    const monthlyCapacity = Math.round(weeklyCapacity * (dpm / 5))
    let estWeeklyVol = 0
    Object.entries(clinicBreakdown).forEach(([code]) => {
      const avgDaily = recentAvg(code, data.rawVolume) / dpm
      let provsOnDay = 0, myDays = 0
      const s = sched[code] || {}
      for (const day of DAYS) { const provs = s[day] || []; if (provs.includes(p.init)) { myDays++; provsOnDay += provs.length } }
      const avgProvsPerDay = myDays > 0 ? provsOnDay / myDays : 1
      estWeeklyVol += (avgProvsPerDay > 0 ? avgDaily / avgProvsPerDay : 0) * myDays
    })
    const estMonthlyVol = Math.round(estWeeklyVol * (dpm / 5))
    const utilPct = monthlyCapacity > 0 ? Math.round((estMonthlyVol / monthlyCapacity) * 100) : 0
    const roomToGrow = Math.max(0, monthlyCapacity - estMonthlyVol)
    const isActive = providerActive(p, monday(new Date()))
    const isFuture = !!(d(p.start) && d(p.start)! > new Date())
    return { ...p, scheduledDays, surgDays, clinicBreakdown, weeklyCapacity, monthlyCapacity, estMonthlyVol, utilPct, roomToGrow, isActive, isFuture }
  })

  const activeProvs = provData.filter((p) => p.isActive && !p.isFuture)
  const avgUtil = activeProvs.length ? Math.round(activeProvs.reduce((s, p) => s + p.utilPct, 0) / activeProvs.length) : 0
  const maxedOut = activeProvs.filter((p) => p.utilPct >= 90).length
  const underUsed = activeProvs.filter((p) => p.utilPct < 60 && p.scheduledDays > 0).length
  const totalRoom = activeProvs.reduce((s, p) => s + p.roomToGrow, 0)

  const sorted = [...provData].sort((a, b) => b.utilPct - a.utilPct)

  return (
    <div>
      <h2>📊 Provider Utilization Scorecard</h2>
      <div className="callout-blue">Compares each provider&apos;s scheduled capacity against actual clinic volume.</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: ".75rem", textTransform: "uppercase", color: "#555", fontWeight: 600, letterSpacing: ".4px" }}>Baseline week:</span>
        <button className={"btn-week" + (base === "A" ? " active" : "")} onClick={() => setBase("A")}>A Week</button>
        <button className={"btn-week" + (base === "B" ? " active" : "")} onClick={() => setBase("B")}>B Week</button>
      </div>
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-val">{avgUtil}%</div><div className="kpi-label">Avg Utilization</div></div>
        <div className="kpi"><div className="kpi-val" style={{ color: maxedOut > 0 ? "#d9534f" : "#2ecc40" }}>{maxedOut}</div><div className="kpi-label">At/Over Capacity</div></div>
        <div className="kpi"><div className="kpi-val" style={{ color: underUsed > 0 ? "#f5a623" : "#2ecc40" }}>{underUsed}</div><div className="kpi-label">Under 60%</div></div>
        <div className="kpi"><div className="kpi-val">{totalRoom.toLocaleString()}</div><div className="kpi-label">Room to Grow (pts/mo)</div></div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table className="timeline-table">
          <thead><tr><th></th><th>Provider</th><th>Pts/Day</th><th>Clinic Days</th><th>Surg</th><th>Weekly Cap</th><th>Monthly Cap</th><th>Est Vol</th><th>Utilization</th><th>Room</th><th>Clinics</th></tr></thead>
          <tbody>
            {sorted.filter((p) => p.scheduledDays > 0 || p.surgDays > 0 || p.isFuture).map((p) => {
              const uc = p.utilPct >= 100 ? "#d9534f" : p.utilPct >= 85 ? "#f5a623" : p.utilPct >= 60 ? "#2ecc40" : "#4a90d9"
              const icon = p.isFuture ? "🕐" : p.isActive ? "🟢" : "🔴"
              const col = p.color || "#888"
              return (
                <tr key={p.init} style={{ opacity: p.isActive && !p.isFuture ? 1 : 0.5 }}>
                  <td style={{ textAlign: "center" }}>{icon}</td>
                  <td><span className="provider-chip" style={{ background: col, borderColor: col, color: chipTextColor(col), fontSize: ".72rem" }}>{p.init}</span> {p.name}{p.isFuture && <span style={{ fontSize: ".65rem", color: "#888" }}> (starts {p.start})</span>}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{p.ptsDay}</td>
                  <td style={{ textAlign: "center" }}>{p.scheduledDays}</td>
                  <td style={{ textAlign: "center" }}>{p.surgDays || "—"}</td>
                  <td style={{ textAlign: "center" }}>{p.weeklyCapacity}</td>
                  <td style={{ textAlign: "center" }}>{p.monthlyCapacity.toLocaleString()}</td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{p.estMonthlyVol.toLocaleString()}</td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div className="util-bar-wrap" style={{ width: 100 }}><div className="util-bar" style={{ width: `${Math.min(p.utilPct, 120) / 1.2}%`, background: uc }} /></div><span style={{ fontSize: ".78rem", fontWeight: 600, color: uc }}>{p.utilPct}%</span></div></td>
                  <td style={{ textAlign: "center", color: p.roomToGrow > 0 ? "#2ecc40" : "#d9534f", fontWeight: 600 }}>{p.roomToGrow > 0 ? "+" + p.roomToGrow.toLocaleString() : "Full"}</td>
                  <td>{Object.entries(p.clinicBreakdown).map(([c, dcount]) => <span key={c} style={{ background: (IA_CLINIC_COLORS[c] || "#888") + "22", color: IA_CLINIC_COLORS[c] || "#888", padding: "1px 5px", borderRadius: 3, fontSize: ".68rem", fontWeight: 600, marginRight: 3 }}>{c}×{dcount}</span>)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
