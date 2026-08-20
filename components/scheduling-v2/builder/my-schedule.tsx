"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { MONTHS, DAYS } from "@/lib/scheduling/constants"
import { monday, addDays, toISODate, weekType } from "@/lib/scheduling/dates"
import { isOnPTO, getRecurringRulesForDate } from "@/lib/scheduling/providers"
import { taskAssignees } from "@/lib/scheduling/tasks"

export default function MySchedule() {
  const { data, ephemeral } = useScheduling()
  const [who, setWho] = useState("")
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [type, init] = who.split(":")
  const clinicName = (code: string) => (code === "Extra/Admin" ? "Extra / Admin" : data.clinicMeta[code]?.full || code)

  const dayTags = (date: Date, dow: number): React.ReactNode[] => {
    const tags: React.ReactNode[] = []
    const isWeekend = dow === 0 || dow === 6
    if (!who) return tags
    if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) { tags.push(<div key="pto" className="ms-clinic-tag pto-day">PTO</div>); return tags }
    if (isWeekend || dow < 1 || dow > 5) return tags
    const di = dow - 1
    if (type === "prov") {
      const wk = weekType(monday(date), data.settings.startWeek)
      const sched = wk === "A" ? data.scheduleA : data.scheduleB
      const dayName = DAYS[di]
      const ds = toISODate(date)
      const isOutAll = data.scheduleOverrides.some((ov) => ov.date === ds && ov.init === init && ov.action === "out-all")
      const outClinics = data.scheduleOverrides.filter((ov) => ov.date === ds && ov.init === init && ov.action === "out-clinic").map((ov) => ov.clinic)
      const covers = data.scheduleOverrides.filter((ov) => ov.date === ds && ov.init === init && ov.action === "cover")
      if (isOutAll) tags.push(<div key="out" className="ms-clinic-tag override-out">Out - All</div>)
      else {
        for (const code of data.clinicOrder) {
          if ((sched[code]?.[dayName] || []).includes(init)) {
            tags.push(<div key={code} className={"ms-clinic-tag " + (outClinics.includes(code) ? "override-out" : "provider")}>{clinicName(code)}</div>)
          }
        }
      }
      covers.forEach((ov) => tags.push(<div key={"cov" + ov.clinic} className="ms-clinic-tag override-cover">+ {clinicName(ov.clinic)}</div>))
    } else {
      const staff = data.currentStaff.find((s) => (s.init || s.name) === init)
      const isXRT = staff?.role === "XR Tech"
      const assigned = isXRT ? data.xrtAssignments[init + "-" + di] : ephemeral.iaAssignments[init + "-" + di]
      if (assigned && assigned !== "Off" && assigned !== "Unassigned") tags.push(<div key="asn" className={"ms-clinic-tag " + (isXRT ? "xrt-assign" : "intern-assign")}>{clinicName(assigned)}</div>)
      data.dailyTasks.forEach((task) => {
        const a = taskAssignees((task as any)[DAYS[di]])
        if (a.some((v) => v === init)) tags.push(<div key={"task" + task.name} className="ms-clinic-tag task-assign">{task.name}</div>)
      })
      getRecurringRulesForDate(init, date, data.recurringRules).forEach((rule) => {
        if (rule.action === "at-clinic") tags.push(<div key={"rr" + rule.clinic} className="ms-clinic-tag override-cover">📍 {clinicName(rule.clinic)}</div>)
      })
    }
    return tags
  }

  const cells: React.ReactNode[] = []
  for (let i = 0; i < startDow; i++) cells.push(<td key={"pre" + i} className="other-month" />)
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = (startDow + day - 1) % 7
    const date = new Date(year, month, day)
    const isToday = date.getTime() === today.getTime()
    const isWeekend = dow === 0 || dow === 6
    cells.push(
      <td key={day} className={(isWeekend ? "weekend " : "") + (isToday ? "today" : "")}>
        <div className="ms-day-num">{day}</div>{who && dayTags(date, dow)}
      </td>
    )
  }
  const weeks: React.ReactNode[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(<tr key={i}>{cells.slice(i, i + 7)}</tr>)

  return (
    <div>
      <h2>Monthly Staff Schedule</h2>
      <div className="callout">Select a staff member to view their full monthly schedule — clinic assignments, PTO, tasks, and coverage changes.</div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div><label className="sm-label">Staff Member</label>
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 240 }}>
            <option value="">— Select a person —</option>
            {data.providers.map((p) => <option key={"p" + p.init} value={"prov:" + p.init}>{p.name} ({p.init}) — Provider</option>)}
            {data.currentStaff.map((s) => { const i = s.init || s.name; return <option key={"s" + i} value={"staff:" + i}>{s.name} ({i}) — {s.role}</option> })}
          </select>
        </div>
        <div className="pto-cal-nav" style={{ marginBottom: 0 }}>
          <button onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1) }}>← Prev</button>
          <span className="month-label">{MONTHS[month]} {year}</span>
          <button onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1) }}>Next →</button>
        </div>
      </div>
      {who ? (
        <div style={{ overflowX: "auto" }}>
          <table className="my-sched-grid">
            <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <th key={d}>{d}</th>)}</tr></thead>
            <tbody>{weeks}</tbody>
          </table>
        </div>
      ) : <div style={{ color: "#888", fontSize: ".82rem", fontStyle: "italic", padding: 20, textAlign: "center" }}>Select a staff member above to view their schedule.</div>}
    </div>
  )
}
