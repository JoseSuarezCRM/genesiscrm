"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { fmtShort } from "@/lib/scheduling/dates"
import { buildTimeline } from "@/lib/scheduling/analytics"

export default function Projection() {
  const { data } = useScheduling()
  const { rows, worstUtil, worstWeek, weeksOver100 } = buildTimeline(data)

  return (
    <div>
      <div className="callout">Monthly growth: <span>{data.settings.growthPct}%</span>. Provider capacity changes as providers start/leave/return.</div>
      <div className="kpi-row">
        <div className={"kpi " + (worstUtil > 100 ? "red" : "green")}><div className="label">Peak Utilization</div><div className="value">{worstUtil}%</div><div className="sub">{worstWeek ? "Week of " + fmtShort(worstWeek) : ""}</div></div>
        <div className={"kpi " + (weeksOver100 > 0 ? "orange" : "green")}><div className="label">Weeks Over Capacity</div><div className="value">{weeksOver100}</div><div className="sub">of {rows.length} projected</div></div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="timeline-table">
          <thead><tr><th>Week Of</th><th>Week</th><th>Active Providers</th><th>Prov-Days/Wk</th><th>Weekly Capacity</th><th>Proj. Volume</th><th>Surplus/Deficit</th><th>Utilization</th><th>Events</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const uc = r.util > 110 ? "red" : r.util > 90 ? "yellow" : r.util > 70 ? "green" : "blue"
              return (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtShort(r.weekStart)}</td>
                  <td style={{ textAlign: "center" }}><span style={{ fontSize: ".72rem", fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: r.wType === "A" ? "#d4edda" : "#cce5ff", color: r.wType === "A" ? "#155724" : "#004085" }}>{r.wType}</span></td>
                  <td style={{ fontSize: ".71rem" }}>{r.activeNames.join(", ")} <span style={{ color: "#888" }}>({r.activeCount})</span></td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{Math.round(r.totalProvDays * 10) / 10}</td>
                  <td style={{ textAlign: "right" }}>{r.weeklyCapacity.toLocaleString()}</td>
                  <td style={{ textAlign: "right" }}>{r.projVolume.toLocaleString()}</td>
                  <td className={r.surplus >= 0 ? "surplus-pos" : "surplus-neg"} style={{ textAlign: "center" }}>{r.surplus >= 0 ? "+" : ""}{r.surplus}</td>
                  <td><div className="util-bar-wrap" style={{ width: 75 }}><div className={"util-bar " + uc} style={{ width: `${Math.min(r.util, 150) / 1.5}%` }} /><div className="util-text">{r.util}%</div></div></td>
                  <td className="notable">{r.events.map((e, k) => <div key={k}>• {e}</div>)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
