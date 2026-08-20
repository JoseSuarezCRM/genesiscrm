"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { d, monday } from "@/lib/scheduling/dates"
import { iaGetWeekDays } from "@/lib/scheduling/assign-interns"
import { xrtGetActiveXRTs, xrtGetXrClinics } from "@/lib/scheduling/assign-xrt"

export default function XrtCalendar() {
  const { data, ephemeral, update } = useScheduling()
  const weekStart = ephemeral.iaWeekStart ? monday(d(ephemeral.iaWeekStart)!) : monday(d(data.settings.startWeek) || new Date())
  const days = iaGetWeekDays(weekStart)
  const xrts = xrtGetActiveXRTs(data, weekStart)
  const xrClinics = xrtGetXrClinics(data)
  const A = data.xrtAssignments

  const override = (key: string, dayIdx: number, value: string) =>
    update((dd) => { dd.xrtAssignments[key + "-" + dayIdx] = value })

  return (
    <div>
      <h2>XRT Assignments</h2>
      {!Object.keys(A).length && <div className="callout" style={{ borderLeftColor: "#9a3412", background: "#fff7ed" }}>Generate from <strong>Schedule Builder → Visit Count</strong> (“Generate XRT Assignments”).</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="intern-assign-grid">
          <thead><tr><th>XR Tech</th>{days.map((dd) => <th key={dd.dayIdx}>{dd.label}<br /><span style={{ fontWeight: 400, fontSize: ".68rem" }}>{dd.dateStr}</span></th>)}</tr></thead>
          <tbody>
            {xrts.map((xrt) => (
              <tr key={xrt.key}>
                <td className="ia-name"><span className="dot dot-active" />{xrt.name} <span style={{ color: "#888", fontWeight: 400 }}>({xrt.init})</span> <span className="role-badge" style={{ background: "#fff7ed", color: "#9a3412", fontSize: ".6rem" }}>XRT</span></td>
                {days.map((dd) => {
                  const key = xrt.key + "-" + dd.dayIdx
                  const a = A[key] || "Off"
                  if (a === "Off") return <td key={dd.dayIdx}><span className="ia-badge ia-off">Off</span></td>
                  if (a === "Unassigned") return <td key={dd.dayIdx}><select className="ia-override-select" value="Unassigned" onChange={(e) => override(xrt.key, dd.dayIdx, e.target.value)}><option value="Unassigned">Unassigned</option>{xrClinics.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                  const color = IA_CLINIC_COLORS[a] || "#888"
                  return <td key={dd.dayIdx}><select className="ia-override-select" style={{ background: color + "22", color, fontWeight: 600 }} value={a} onChange={(e) => override(xrt.key, dd.dayIdx, e.target.value)}><option value={a}>{a}</option><option value="Unassigned">Unassigned</option>{xrClinics.filter((c) => c !== a).map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: ".82rem", marginTop: 18, color: "#1a1a2e", textTransform: "uppercase", letterSpacing: ".4px" }}>XRT Daily Coverage</h3>
      <table className="ia-summary-table">
        <thead><tr><th>Clinic</th>{days.map((dd) => <th key={dd.dayIdx}>{dd.label}</th>)}</tr></thead>
        <tbody>
          {xrClinics.map((code) => {
            const color = IA_CLINIC_COLORS[code] || "#888"
            return (
              <tr key={code}>
                <td className="ia-s-name" style={{ borderLeft: `3px solid ${color}` }}>{code} <span style={{ background: "#fff7ed", color: "#9a3412", fontSize: ".55rem", padding: "0 3px", borderRadius: 2 }}>XR</span></td>
                {days.map((dd) => {
                  const assigned = xrts.filter((x) => A[x.key + "-" + dd.dayIdx] === code)
                  const vol = ephemeral.iaVolumes[code + "-" + dd.dayIdx] || 0
                  const bg = vol > 0 && assigned.length === 0 ? "#fff0f0" : vol === 0 ? "#fafafa" : "#fff7ed"
                  return <td key={dd.dayIdx} style={{ background: bg, fontSize: ".76rem" }}>{vol > 0 ? <><strong>{assigned.length}</strong> <span style={{ color: "#888" }}>{assigned.map((x) => x.init).join(", ") || "⚠️"}</span></> : <span style={{ color: "#ccc" }}>—</span>}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="ia-stats-row">
        <div className="ia-stat"><div className="val" style={{ color: "#9a3412" }}>{Object.values(A).filter((a) => a !== "Off" && a !== "Unassigned").length}</div><div className="lbl">XRT Assignments</div></div>
        <div className="ia-stat"><div className="val">{xrts.length}</div><div className="lbl">Active XRTs</div></div>
        <div className="ia-stat"><div className="val">{xrClinics.length}</div><div className="lbl">XR-Need Clinics</div></div>
      </div>
    </div>
  )
}
