"use client"

import { useScheduling } from "@/components/scheduling-v2/store"

const TIER_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function StaffingRules() {
  const { data, update } = useScheduling()
  return (
    <div>
      <h2>Staffing Rules Engine</h2>
      <p className="desc-text-lg">Define how many staff are needed based on daily patient volume. Drives the XRT, Front Desk, and MA requirements used by the Generate Assignments engines.</p>
      <table className="staffing-rules-table">
        <thead><tr><th>Tier</th><th>Min Pts</th><th>Max Pts</th><th>Total Staff</th><th>Breakdown</th><th></th></tr></thead>
        <tbody>
          {data.staffingRules.map((r, i) => {
            const color = TIER_COLORS[i % TIER_COLORS.length]
            return (
              <tr key={i}>
                <td><span className="sr-tier-badge" style={{ background: color + "22", color }}>Tier {i + 1}</span></td>
                <td><input type="number" value={r.minPts} min={0} onChange={(e) => update((dd) => { dd.staffingRules[i].minPts = +e.target.value })} /></td>
                <td><input type="number" value={r.maxPts} min={0} onChange={(e) => update((dd) => { dd.staffingRules[i].maxPts = +e.target.value })} /></td>
                <td><input type="number" value={r.totalStaff} min={1} max={20} onChange={(e) => update((dd) => { dd.staffingRules[i].totalStaff = +e.target.value })} /></td>
                <td><input type="text" value={r.breakdown} onChange={(e) => update((dd) => { dd.staffingRules[i].breakdown = e.target.value })} /></td>
                <td><button className="btn-x" onClick={() => update((dd) => { dd.staffingRules.splice(i, 1) })}>✕</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button className="btn-add" onClick={() => update((dd) => { dd.staffingRules.push({ minPts: 0, maxPts: 0, totalStaff: 1, breakdown: "" }) })}>+ Add Tier</button>
      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ fontSize: ".75rem", fontWeight: 600, textTransform: "uppercase", color: "#555", letterSpacing: ".4px" }}>Above highest tier: +1 staff per every</label>
        <input type="number" value={data.staffingRulesExtra} min={1} max={50} style={{ width: 55, textAlign: "center" }} onChange={(e) => update((dd) => { dd.staffingRulesExtra = +e.target.value })} />
        <span style={{ fontSize: ".78rem", color: "#888" }}>additional patients</span>
      </div>
      <div className="callout" style={{ marginTop: 14 }}><strong>How it works:</strong> When a clinic-day's volume falls in a tier, that many staff are required. Above the top tier, every extra block of patients adds one more.</div>
    </div>
  )
}
