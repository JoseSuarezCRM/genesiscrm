"use client"

import { useScheduling } from "../store"

// Schedule Builder → Staffing Rules (renderStaffingRules).
//
// These tiers are what both assignment engines size a clinic-day against, and
// what the Full Schedule grid's over/under badges compare the actual headcount
// to — so editing a tier changes three screens at once.

const TIER_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function StaffingRules() {
  const { data, update } = useScheduling()

  const set = (i: number, key: string, val: any) =>
    update((dd) => { (dd.staffingRules[i] as any)[key] = val })

  return (
    <div>
      <h2>Staffing Rules Engine</h2>
      <p className="desc-text-lg">
        Define how many staff are needed based on daily patient volume at each clinic. These rules determine
        the XRT, Front Desk and MA requirements used by the Generate Assignments engines.
      </p>

      <table className="staffing-rules-table">
        <thead>
          <tr>
            <th>Tier</th><th>Min Pts</th><th>Max Pts</th><th>Total Staff</th><th>Breakdown</th><th />
          </tr>
        </thead>
        <tbody>
          {data.staffingRules.map((r, i) => {
            const color = TIER_COLORS[i % TIER_COLORS.length]
            return (
              <tr key={i}>
                <td><span className="sr-tier-badge" style={{ background: color + "22", color }}>Tier {i + 1}</span></td>
                <td><input type="number" min={0} value={r.minPts} onChange={(e) => set(i, "minPts", +e.target.value)} /></td>
                <td><input type="number" min={0} value={r.maxPts} onChange={(e) => set(i, "maxPts", +e.target.value)} /></td>
                <td><input type="number" min={1} max={20} value={r.totalStaff} onChange={(e) => set(i, "totalStaff", +e.target.value)} /></td>
                <td><input type="text" value={r.breakdown} onChange={(e) => set(i, "breakdown", e.target.value)} /></td>
                <td><button className="btn-x" onClick={() => update((dd) => { dd.staffingRules.splice(i, 1) })}>×</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <button
        className="btn-add"
        onClick={() => update((dd) => { dd.staffingRules.push({ minPts: 0, maxPts: 0, totalStaff: 1, breakdown: "" }) })}
      >
        + Add Tier
      </button>

      <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ fontSize: ".75rem", fontWeight: 600, textTransform: "uppercase", color: "var(--ink-muted)", letterSpacing: ".4px" }}>
          Above highest tier: +1 staff per every
        </label>
        <input
          type="number" min={1} max={50} style={{ width: 55, textAlign: "center" }}
          value={data.staffingRulesExtra}
          onChange={(e) => update((dd) => { dd.staffingRulesExtra = +e.target.value || 15 })}
        />
        <span style={{ fontSize: ".78rem", color: "var(--ink-faint)" }}>additional patients</span>
      </div>

      <div className="callout" style={{ marginTop: 14 }}>
        <strong>How it works:</strong> when a clinic-day&apos;s volume falls in a tier, that many staff are
        required — 30 patients means 1 XRT + 1 FD + 1 MA. Above the top tier, every extra block of patients
        adds one more person.
      </div>
    </div>
  )
}
