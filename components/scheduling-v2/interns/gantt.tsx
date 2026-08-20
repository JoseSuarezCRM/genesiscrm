"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { roleBadgeClass } from "@/components/scheduling-v2/shared"
import { d, monday, addDays } from "@/lib/scheduling/dates"

export default function InternGantt() {
  const { data } = useScheduling()
  let startDate = monday(d(data.settings.startWeek) || new Date())
  const numWeeks = Math.min(+data.settings.weeksProject || 24, 32)
  const orientDays = +data.settings.orientDays || 7
  const cellW = 28
  const weekDates: Date[] = []
  for (let i = 0; i < numWeeks; i++) weekDates.push(addDays(startDate, i * 7))

  const renderRow = (name: string, role: string, startStr: string, endStr: string, clinicPref: string, notes: string, type: string, key: string) => {
    const s = d(startStr), e = d(endStr)
    const roleCls = roleBadgeClass(role || type)
    return (
      <tr key={key}>
        <td style={{ whiteSpace: "nowrap", fontSize: ".8rem" }}><strong>{name}</strong>{clinicPref && <br />}{clinicPref && clinicPref.split(",").map((c, i) => <span key={i} className="pref-tag">{c.trim()}</span>)}</td>
        <td><span className={"role-badge " + roleCls} style={{ fontSize: ".67rem" }}>{role || type}</span>{notes && <div style={{ fontSize: ".65rem", color: "#888", marginTop: 1 }}>{notes}</div>}</td>
        {weekDates.map((w, wi) => {
          const weekEnd = addDays(w, 6)
          const activeStart = type === "incoming" ? (s ? addDays(s, orientDays) : null) : s
          const departed = !!(e && e < w)
          const notStarted = !!(activeStart && activeStart > weekEnd)
          const inOrient = type === "incoming" && !!s && s <= weekEnd && !!activeStart && activeStart > w
          if (departed || notStarted) return <td key={wi} style={{ background: departed ? "#f9f9f9" : undefined }} />
          const bg = inOrient ? "#b8dab8" : "#2ecc40"
          const title = inOrient ? "Orientation" : "Active"
          return <td key={wi} style={{ background: inOrient ? "#e8f5e8" : "#e8f8ed", textAlign: "center" }}><div style={{ width: cellW - 4, height: 14, background: bg, borderRadius: 2, margin: "4px auto" }} title={title} /></td>
        })}
      </tr>
    )
  }

  return (
    <div>
      <h2>Intern Transition Timeline</h2>
      <p className="desc-text">Visual timeline of intern arrivals and departures.</p>
      <div className="intern-gantt">
        <table className="gantt-table">
          <thead><tr><th>Name</th><th>Role / Type</th>{weekDates.map((w, wi) => <th key={wi} style={{ minWidth: cellW, fontSize: ".6rem", padding: "3px 2px" }}>{w.getMonth() + 1}/{w.getDate()}</th>)}</tr></thead>
          <tbody>
            <tr><td colSpan={numWeeks + 2} style={{ background: "#f4f4f4", padding: "5px 8px", fontSize: ".72rem", textTransform: "uppercase", color: "#555", fontWeight: 600 }}>Current Staff</td></tr>
            {data.currentStaff.filter((s) => s.role !== "XR Tech").map((s, i) => renderRow(s.name, s.role, "", s.lastDay, (data.iaPreferences[s.init || s.name] || []).join(","), s.notes, "current", "c" + i))}
            <tr><td colSpan={numWeeks + 2} style={{ background: "#e8f0fe", padding: "5px 8px", fontSize: ".72rem", textTransform: "uppercase", color: "#2244aa", fontWeight: 600 }}>Incoming 2026 Interns</td></tr>
            {data.incomingInterns.map((s, i) => renderRow(s.name, "Incoming", s.start, "", (data.iaPreferences[s.name] || []).join(","), s.notes, "incoming", "i" + i))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
