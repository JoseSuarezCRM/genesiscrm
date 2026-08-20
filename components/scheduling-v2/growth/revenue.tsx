"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { DAYS, MONTHS } from "@/lib/scheduling/constants"
import { recentAvg } from "@/lib/scheduling/volume"

export default function Revenue() {
  const { data } = useScheduling()
  const [avgRate, setAvgRate] = useState(185)
  const [surgRate, setSurgRate] = useState(2500)
  const [dpm, setDpm] = useState(21)
  const growthPct = (+data.settings.growthPct || 2) / 100

  let totalMonthlyRev = 0, totalSurgRev = 0
  const clinicRevData = data.clinicOrder.map((code) => {
    const meta = data.clinicMeta[code]
    if (!meta) return null
    if (meta.isSurgery) {
      const s = data.scheduleA[code] || {}
      let weeklyDays = 0
      DAYS.forEach((day) => { if ((s[day] || []).length) weeklyDays++ })
      const monthlyCases = Math.round(weeklyDays * (dpm / 5))
      const rev = monthlyCases * surgRate
      totalSurgRev += rev
      return { code, full: meta.full, isSurgery: true, volume: monthlyCases, rate: surgRate, monthlyRev: rev, annualRev: rev * 12 }
    }
    const avgVol = recentAvg(code, data.rawVolume)
    const rev = avgVol * avgRate
    totalMonthlyRev += rev
    return { code, full: meta.full, isSurgery: false, volume: avgVol, rate: avgRate, monthlyRev: rev, annualRev: rev * 12 }
  }).filter(Boolean) as { code: string; full: string; isSurgery: boolean; volume: number; rate: number; monthlyRev: number; annualRev: number }[]

  const grandMonthly = totalMonthlyRev + totalSurgRev
  const grandAnnual = grandMonthly * 12
  const sortedTable = [...clinicRevData].sort((a, b) => b.monthlyRev - a.monthlyRev)
  const maxRev = Math.max(...clinicRevData.map((c) => c.monthlyRev), 1)
  const now = new Date()

  return (
    <div>
      <h2>💰 Revenue &amp; Financial Model</h2>
      <div className="callout-blue">Estimates revenue from patient volume and average reimbursement. Adjust rates to model scenarios.</div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div><label className="sm-label">Avg Reimb / Visit ($)</label><input type="number" value={avgRate} min={0} step={5} style={{ width: 90 }} onChange={(e) => setAvgRate(+e.target.value)} /></div>
        <div><label className="sm-label">Surgery Avg / Case ($)</label><input type="number" value={surgRate} min={0} step={50} style={{ width: 100 }} onChange={(e) => setSurgRate(+e.target.value)} /></div>
        <div><label className="sm-label">Working Days / Month</label><input type="number" value={dpm} min={15} max={25} style={{ width: 55 }} onChange={(e) => setDpm(+e.target.value)} /></div>
      </div>
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-val" style={{ color: "#2ecc40" }}>${(grandMonthly / 1000).toFixed(0)}K</div><div className="kpi-label">Est Monthly Revenue</div></div>
        <div className="kpi"><div className="kpi-val" style={{ color: "#2ecc40" }}>${(grandAnnual / 1000000).toFixed(1)}M</div><div className="kpi-label">Est Annual Revenue</div></div>
        <div className="kpi"><div className="kpi-val">${(totalMonthlyRev / 1000).toFixed(0)}K</div><div className="kpi-label">Clinic Revenue/Mo</div></div>
        <div className="kpi"><div className="kpi-val">${(totalSurgRev / 1000).toFixed(0)}K</div><div className="kpi-label">Surgery Revenue/Mo</div></div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table className="timeline-table">
          <thead><tr><th>Clinic</th><th>Type</th><th>Monthly Vol</th><th>Rate</th><th>Monthly Rev</th><th>Annual Rev</th><th></th></tr></thead>
          <tbody>
            {sortedTable.filter((c) => c.volume > 0).map((c) => {
              const pct = Math.round((c.monthlyRev / maxRev) * 100)
              const barCol = c.isSurgery ? "#991b1b" : "#4a90d9"
              return (
                <tr key={c.code}>
                  <td style={{ fontWeight: 600 }}>{c.full} <span style={{ color: "#888", fontSize: ".7rem" }}>{c.code}</span></td>
                  <td><span style={{ background: c.isSurgery ? "#fef2f2" : "#f0f4ff", color: c.isSurgery ? "#991b1b" : "#4a90d9", padding: "2px 8px", borderRadius: 3, fontSize: ".68rem", fontWeight: 600 }}>{c.isSurgery ? "Surgery" : "Clinic"}</span></td>
                  <td style={{ textAlign: "center" }}>{c.volume.toLocaleString()}</td>
                  <td style={{ textAlign: "center" }}>${c.rate.toLocaleString()}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>${c.monthlyRev.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>${c.annualRev.toLocaleString()}</td>
                  <td><div className="util-bar-wrap" style={{ width: 120 }}><div className="util-bar" style={{ width: `${pct}%`, background: barCol }} /></div></td>
                </tr>
              )
            })}
            <tr style={{ background: "#f0f0f0", fontWeight: 700 }}><td>TOTAL</td><td></td><td></td><td></td><td style={{ textAlign: "right", color: "#2ecc40" }}>${grandMonthly.toLocaleString()}</td><td style={{ textAlign: "right", color: "#2ecc40" }}>${grandAnnual.toLocaleString()}</td><td></td></tr>
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: 24 }}>📈 6-Month Revenue Projection</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="timeline-table">
          <thead><tr><th>Metric</th>{Array.from({ length: 6 }).map((_, i) => { const mi = (now.getMonth() + i) % 12; const yi = now.getFullYear() + Math.floor((now.getMonth() + i) / 12); return <th key={i}>{MONTHS[mi].slice(0, 3)} {yi}</th> })}</tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Clinic Revenue</td>{Array.from({ length: 6 }).map((_, i) => <td key={i} style={{ textAlign: "right" }}>${(Math.round(totalMonthlyRev * Math.pow(1 + growthPct, i)) / 1000).toFixed(0)}K</td>)}</tr>
            <tr><td style={{ fontWeight: 600 }}>Surgery Revenue</td>{Array.from({ length: 6 }).map((_, i) => <td key={i} style={{ textAlign: "right" }}>${(Math.round(totalSurgRev * Math.pow(1 + growthPct, i)) / 1000).toFixed(0)}K</td>)}</tr>
            <tr style={{ background: "#f0f0f0", fontWeight: 700 }}><td>Total Revenue</td>{Array.from({ length: 6 }).map((_, i) => <td key={i} style={{ textAlign: "right", color: "#2ecc40" }}>${(Math.round(grandMonthly * Math.pow(1 + growthPct, i)) / 1000).toFixed(0)}K</td>)}</tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
