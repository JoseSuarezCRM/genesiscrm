"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { roleBadgeClass } from "@/components/scheduling-v2/shared"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { d, monday } from "@/lib/scheduling/dates"
import { iaGetActiveInterns, iaGetWeekDays, iaProviderAtClinic } from "@/lib/scheduling/assign-interns"

export default function InternCalendar() {
  const { data, ephemeral, setEphemeral } = useScheduling()
  const weekStart = ephemeral.iaWeekStart ? monday(d(ephemeral.iaWeekStart)!) : monday(d(data.settings.startWeek) || new Date())
  const days = iaGetWeekDays(weekStart)
  const allInterns = iaGetActiveInterns(data, weekStart)
  const A = ephemeral.iaAssignments

  const override = (key: string, dayIdx: number, value: string) =>
    setEphemeral((e) => { e.iaManualOverrides[key + "-" + dayIdx] = value; e.iaAssignments[key + "-" + dayIdx] = value })

  const hasAssignments = Object.keys(A).length > 0

  return (
    <div>
      <h2>Intern Assignments</h2>
      {!hasAssignments && <div className="callout">Generate assignments from <strong>Schedule Builder → Visit Count</strong> (enter volume, then “Generate Intern Assignments”).</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="intern-assign-grid">
          <thead><tr><th>Intern</th>{days.map((dd) => <th key={dd.dayIdx}>{dd.label}<br /><span style={{ fontWeight: 400, fontSize: ".68rem" }}>{dd.dateStr}</span></th>)}</tr></thead>
          <tbody>
            {allInterns.map((intern) => (
              <tr key={intern.key}>
                <td className="ia-name"><span className={"dot " + (intern.avail >= 0.8 ? "dot-active" : intern.avail >= 0.4 ? "dot-leave" : "dot-inactive")} />{intern.name} <span style={{ color: "#888", fontWeight: 400 }}>({intern.init})</span> <span className={"role-badge " + roleBadgeClass(intern.role)} style={{ fontSize: ".6rem" }}>{intern.role}</span></td>
                {days.map((dd) => {
                  const key = intern.key + "-" + dd.dayIdx
                  const assignment = A[key] || "Off"
                  const isManual = !!ephemeral.iaManualOverrides[key]
                  if (assignment === "Off") return <td key={dd.dayIdx}><span className="ia-badge ia-off">Off</span></td>
                  if (assignment === "Extra/Admin") return (
                    <td key={dd.dayIdx}>
                      <select className={"ia-override-select" + (isManual ? " manual" : "")} value="Extra/Admin" onChange={(e) => override(intern.key, dd.dayIdx, e.target.value)}>
                        <option value="Extra/Admin">Extra / Admin</option>
                        {data.clinicOrder.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  )
                  const color = IA_CLINIC_COLORS[assignment] || "#888"
                  const vol = ephemeral.iaVolumes[assignment + "-" + dd.dayIdx] || 0
                  return (
                    <td key={dd.dayIdx}>
                      <select className={"ia-override-select" + (isManual ? " manual" : "")} style={{ background: color + "22", color, fontWeight: 600 }} value={assignment} onChange={(e) => override(intern.key, dd.dayIdx, e.target.value)}>
                        <option value={assignment}>{assignment} ({vol}pts)</option>
                        <option value="Extra/Admin">Extra / Admin</option>
                        {data.clinicOrder.filter((c) => c !== assignment).map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Coverage summary */}
      <h3 style={{ fontSize: ".82rem", marginTop: 18, color: "#1a1a2e", textTransform: "uppercase", letterSpacing: ".4px" }}>Daily Clinic Coverage</h3>
      <table className="ia-summary-table">
        <thead><tr><th>Clinic</th>{days.map((dd) => <th key={dd.dayIdx}>{dd.label}</th>)}</tr></thead>
        <tbody>
          {data.clinicOrder.map((code) => {
            const meta = data.clinicMeta[code]
            if (!meta) return null
            const color = IA_CLINIC_COLORS[code] || "#888"
            return (
              <tr key={code}>
                <td className="ia-s-name" style={{ borderLeft: `3px solid ${color}` }}>{code}</td>
                {days.map((dd) => {
                  const vol = ephemeral.iaVolumes[code + "-" + dd.dayIdx] || 0
                  const assigned = allInterns.filter((i) => A[i.key + "-" + dd.dayIdx] === code)
                  const provs = iaProviderAtClinic(data, code, dd.dayName, weekStart)
                  const hasProvider = provs.length > 0
                  const bg = !hasProvider ? "#f0f0f0" : vol > 0 && assigned.length === 0 ? "#fff0f0" : vol === 0 ? "#fafafa" : "#f0fff4"
                  return <td key={dd.dayIdx} style={{ background: bg, fontSize: ".76rem" }}>{!hasProvider ? <span style={{ color: "#ccc" }}>—</span> : vol > 0 ? <><strong>{assigned.length}</strong> <span style={{ color: "#888" }}>{assigned.map((i) => i.init).join(", ") || "⚠️"}</span></> : <span style={{ color: "#ccc" }}>—</span>}</td>
                })}
              </tr>
            )
          })}
          <tr>
            <td className="ia-s-name" style={{ borderLeft: "3px solid #ccc" }}>Extra/Admin</td>
            {days.map((dd) => { const extras = allInterns.filter((i) => A[i.key + "-" + dd.dayIdx] === "Extra/Admin"); return <td key={dd.dayIdx} style={{ fontSize: ".76rem" }}>{extras.length ? extras.map((i) => i.init).join(", ") : "—"}</td> })}
          </tr>
        </tbody>
      </table>

      {/* Stats */}
      <div className="ia-stats-row">
        <div className="ia-stat"><div className="val">{Object.values(A).filter((a) => a !== "Off" && a !== "Extra/Admin").length}</div><div className="lbl">Clinic Assignments</div></div>
        <div className="ia-stat"><div className="val">{Object.values(A).filter((a) => a === "Extra/Admin").length}</div><div className="lbl">Extra / Admin Days</div></div>
        <div className="ia-stat"><div className="val">{allInterns.filter((i) => i.avail >= 0.8).length}</div><div className="lbl">FT Interns Active</div></div>
      </div>
    </div>
  )
}
