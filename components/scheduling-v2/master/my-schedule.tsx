"use client"

import { useMemo, useState } from "react"
import { useScheduling } from "../store"
import { DAYS, MONTH_NAMES, WEEKDAYS } from "@/lib/scheduling/constants"
import { clinicToday, monday, weekType, ymd } from "@/lib/scheduling/dates"
import { getRecurringRulesForDate, isOnPTO } from "@/lib/scheduling/providers"
import { isXrtRole } from "@/lib/scheduling/staffing"
import { taskGetAssignees } from "@/lib/scheduling/tasks"
import { EXTRA_ADMIN } from "@/lib/scheduling/constants"

// Master Schedule → My Schedule (the dashboard's renderMySchedule).
//
// One person, one month. A provider's days come from the A/B rotation plus their
// overrides; a staff member's come from whatever the assignment engines last
// produced, plus their recurring tasks and at-clinic rules.

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function MySchedule() {
  const { data, ephemeral } = useScheduling()
  const today = useMemo(() => clinicToday(), [])
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const [who, setWho] = useState("")

  const prev = () => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1) }

  const [type, init] = who ? who.split(":") : ["", ""]
  const person = type === "prov"
    ? data.providers.find((p) => p.init === init)
    : data.currentStaff.find((s) => (s.init || s.name) === init)

  return (
    <div>
      <h2>Monthly Staff Schedule</h2>
      <div className="callout">
        Select a staff member to view their full monthly schedule. Shows which clinics they&apos;re assigned
        to each day, including PTO, tasks, and coverage changes.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <label className="sm-label">Staff Member</label>
          <select style={{ width: 220 }} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">— Select a person —</option>
            {data.providers.map((p) => (
              <option key={"prov:" + p.init} value={"prov:" + p.init}>
                {p.name} ({p.init}) — Provider
              </option>
            ))}
            {data.currentStaff.map((s) => {
              const k = s.init || s.name
              return <option key={"staff:" + k} value={"staff:" + k}>{s.name} ({k}) — {s.role}</option>
            })}
          </select>
        </div>
        <div className="pto-cal-nav" style={{ marginBottom: 0 }}>
          <button onClick={prev}>← Prev</button>
          <span className="month-label">{MONTH_NAMES[month]} {year}</span>
          <button onClick={next}>Next →</button>
        </div>
      </div>

      {!who || !person ? (
        <div style={{ color: "var(--ink-faint)", fontSize: ".82rem", fontStyle: "italic", padding: 20, textAlign: "center" }}>
          Select a staff member above to view their schedule.
        </div>
      ) : (
        <MonthGrid
          month={month}
          year={year}
          today={today}
          type={type}
          init={init}
          isXrt={type === "staff" && isXrtRole((person as any).role)}
        />
      )}
    </div>
  )
}

function MonthGrid({
  month, year, today, type, init, isXrt,
}: {
  month: number
  year: number
  today: Date
  type: string
  init: string
  isXrt: boolean
}) {
  const { data, ephemeral } = useScheduling()

  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: React.ReactNode[] = []
  for (let i = 0; i < startDow; i++) cells.push(<td key={"lead" + i} className="other-month" />)

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = (startDow + day - 1) % 7
    const date = new Date(year, month, day)
    const isToday = date.getTime() === today.getTime()
    const isWeekend = dow === 0 || dow === 6
    const cls = [isWeekend ? "weekend" : "", isToday ? "today" : ""].filter(Boolean).join(" ")
    const onPto = isOnPTO(init, date, data.ptoEntries, data.recurringRules)
    const tags: React.ReactNode[] = []

    if (onPto) tags.push(<div key="pto" className="ms-clinic-tag pto-day">PTO</div>)

    // Weekdays only: dow 1..5 maps to DAYS[0..4].
    if (!isWeekend && dow >= 1 && dow <= 5 && !onPto) {
      const di = dow - 1
      const dayName = DAYS[di]

      if (type === "prov") {
        const wk = weekType(monday(date), data.settings.startWeek)
        const sched = wk === "A" ? data.scheduleA : data.scheduleB
        const dateStr = ymd(date)
        const isOutAll = data.scheduleOverrides.some(
          (ov) => ov.date === dateStr && ov.init === init && ov.action === "out-all"
        )
        const outClinics = data.scheduleOverrides
          .filter((ov) => ov.date === dateStr && ov.init === init && ov.action === "out-clinic")
          .map((ov) => ov.clinic)
        const covers = data.scheduleOverrides.filter(
          (ov) => ov.date === dateStr && ov.init === init && ov.action === "cover"
        )

        if (isOutAll) {
          tags.push(<div key="outall" className="ms-clinic-tag override-out">Out - All</div>)
        } else {
          for (const code of data.clinicOrder) {
            if (!(sched[code]?.[dayName] || []).includes(init)) continue
            const label = data.clinicMeta[code]?.full ?? code
            tags.push(
              <div key={code} className={"ms-clinic-tag " + (outClinics.includes(code) ? "override-out" : "provider")}>
                {label}
              </div>
            )
          }
        }
        for (const ov of covers) {
          tags.push(
            <div key={"cov" + ov.clinic} className="ms-clinic-tag override-cover">
              + {data.clinicMeta[ov.clinic]?.full ?? ov.clinic}
            </div>
          )
        }
      } else {
        const assigned = isXrt
          ? data.xrtAssignments[`${init}-${di}`]
          : ephemeral.iaAssignments[`${init}-${di}`]
        if (assigned) {
          const label = assigned === EXTRA_ADMIN
            ? "Extra / Admin"
            : data.clinicMeta[assigned]?.full ?? assigned
          tags.push(
            <div key="assign" className={"ms-clinic-tag " + (isXrt ? "xrt-assign" : "intern-assign")}>{label}</div>
          )
        }
        data.dailyTasks.forEach((task, ti) => {
          if (taskGetAssignees((task as any)[WEEKDAYS[di]]).includes(init)) {
            tags.push(<div key={"task" + ti} className="ms-clinic-tag task-assign">{task.name}</div>)
          }
        })
        for (const rule of getRecurringRulesForDate(init, date, data.recurringRules)) {
          if (rule.action !== "at-clinic") continue
          tags.push(
            <div key={"rr" + rule.clinic} className="ms-clinic-tag override-cover">
              🔁 {data.clinicMeta[rule.clinic]?.full ?? rule.clinic}
            </div>
          )
        }
      }
    }

    cells.push(
      <td key={day} className={cls}>
        <div className="ms-day-num">{day}</div>
        {tags}
      </td>
    )
  }

  const endDow = (startDow + daysInMonth - 1) % 7
  for (let i = endDow + 1; i < 7; i++) cells.push(<td key={"trail" + i} className="other-month" />)

  const rows: React.ReactNode[] = []
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(<tr key={i}>{cells.slice(i, i + 7)}</tr>)
  }

  return (
    <table className="my-sched-grid">
      <thead><tr>{DOW_LABELS.map((l) => <th key={l}>{l}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  )
}
