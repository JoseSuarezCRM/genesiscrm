"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { MONTHS } from "@/lib/scheduling/constants"
import { d, addDays, fmtShort } from "@/lib/scheduling/dates"
import { roleBadgeClass } from "@/components/scheduling-v2/shared"

const INTERN_ROLES = ["Lead Intern", "Intern 2025", "Intern 2026", "Careerist"]
const DAY_MS = 1000 * 60 * 60 * 24

export default function InternRoi() {
  const { data } = useScheduling()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const orientDays = +data.settings.orientDays || 7

  const allStaff = data.currentStaff.filter((s) => INTERN_ROLES.includes(s.role)).map((s) => {
    const ld = d(s.lastDay)
    const departed = !!(ld && ld < today)
    const daysLeft = ld ? Math.max(0, Math.round((ld.getTime() - today.getTime()) / DAY_MS)) : null
    const weeksLeft = daysLeft !== null ? Math.round(daysLeft / 7) : null
    let availDays = 0
    const da = s.dayAvail || {}
    ;(["MON", "TUE", "WED", "THU", "FRI"] as const).forEach((day) => { const st = da[day] || "available"; if (st === "available") availDays += 1; else if (st === "lastresort") availDays += 0.5 })
    if (s.avail < 1) availDays = Math.round(availDays * s.avail * 10) / 10
    return { name: s.name, init: s.init || s.name, role: s.role, lastDay: s.lastDay, departed, daysLeft, weeksLeft, availDays, notes: s.notes || "" }
  })

  const incoming = data.incomingInterns.map((s) => {
    const st = d(s.start)
    const started = !!(st && st <= today)
    const daysUntil = st ? Math.max(0, Math.round((st.getTime() - today.getTime()) / DAY_MS)) : null
    const orientEnd = st ? addDays(st, orientDays) : null
    const isOrienting = started && !!orientEnd && orientEnd > today
    const isActive = started && !isOrienting
    return { name: s.name, init: s.name, role: "Incoming", start: s.start, started, daysUntil, isOrienting, isActive, availDays: isActive ? 5 : 0, notes: s.notes || "" }
  })

  const activeStaff = allStaff.filter((s) => !s.departed)
  const activeIncoming = incoming.filter((s) => s.isActive)
  const totalActiveDays = activeStaff.reduce((s, i) => s + i.availDays, 0) + activeIncoming.reduce((s, i) => s + i.availDays, 0)
  const departing30 = activeStaff.filter((s) => s.daysLeft !== null && s.daysLeft <= 30)
  const departing60 = activeStaff.filter((s) => s.daysLeft !== null && s.daysLeft <= 60 && s.daysLeft > 30)

  const combined = [...activeStaff, ...incoming.filter((s) => !s.started || s.isOrienting || s.isActive)]
  combined.sort((a: any, b: any) => {
    const au = a.daysLeft != null ? a.daysLeft : a.daysUntil != null ? 1000 + a.daysUntil : 9999
    const bu = b.daysLeft != null ? b.daysLeft : b.daysUntil != null ? 1000 + b.daysUntil : 9999
    return au - bu
  })

  const startMonth = today.getMonth(), startYear = today.getFullYear()
  const monthCells = Array.from({ length: 6 }).map((_, i) => { const mi = (startMonth + i) % 12; const yi = startYear + Math.floor((startMonth + i) / 12); return { mi, yi, label: MONTHS[mi].slice(0, 3) + " " + yi } })

  return (
    <div>
      <h2>🎓 Intern ROI &amp; Training Pipeline</h2>
      <div className="callout-blue">Tracks intern lifecycle from onboarding through departure, and when to recruit the next class.</div>
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-val">{activeStaff.length + activeIncoming.length}</div><div className="kpi-label">Active Interns/MAs</div></div>
        <div className="kpi"><div className="kpi-val">{incoming.filter((s) => !s.started).length}</div><div className="kpi-label">Incoming (Not Started)</div></div>
        <div className="kpi"><div className="kpi-val">{Math.round(totalActiveDays)}</div><div className="kpi-label">Total Clinic-Days/Wk</div></div>
        <div className="kpi"><div className="kpi-val" style={{ color: departing30.length ? "#d9534f" : "#2ecc40" }}>{departing30.length}</div><div className="kpi-label">Departing ≤30 Days</div></div>
        <div className="kpi"><div className="kpi-val" style={{ color: departing60.length ? "#f5a623" : "#2ecc40" }}>{departing60.length}</div><div className="kpi-label">Departing 31–60 Days</div></div>
      </div>

      <h3 style={{ marginTop: 18 }}>👥 Current Roster Lifecycle</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="timeline-table">
          <thead><tr><th>Status</th><th>Name</th><th>Role</th><th>Avail Days/Wk</th><th>End/Start</th><th>Time Remaining</th><th>Notes</th></tr></thead>
          <tbody>
            {combined.map((s: any, i) => {
              let status = "✅ Active", statusColor = "#2ecc40"
              if (s.isOrienting) { status = "📚 Orienting"; statusColor = "#f59e0b" }
              else if (s.daysUntil !== undefined && !s.started) { status = "🎥 Incoming"; statusColor = "#4a90d9" }
              else if (s.daysLeft != null && s.daysLeft <= 14) { status = "🚨 Imminent"; statusColor = "#d9534f" }
              else if (s.daysLeft != null && s.daysLeft <= 30) { status = "⚠️ Departing"; statusColor = "#f5a623" }
              else if (s.daysLeft != null && s.daysLeft <= 60) { status = "📅 Wrapping Up"; statusColor = "#f59e0b" }
              const timeStr = s.daysLeft != null ? `${s.daysLeft}d (${s.weeksLeft}wk)` : s.daysUntil !== undefined ? (s.started ? "Active" : `Starts in ${s.daysUntil}d`) : "Ongoing"
              return (
                <tr key={i}>
                  <td><span style={{ color: statusColor, fontWeight: 600, fontSize: ".78rem" }}>{status}</span></td>
                  <td style={{ fontWeight: 600 }}>{s.name} <span style={{ color: "#888", fontWeight: 400 }}>({s.init})</span></td>
                  <td><span className={"role-badge " + roleBadgeClass(s.role)} style={{ fontSize: ".65rem" }}>{s.role}</span></td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>{s.availDays}</td>
                  <td style={{ textAlign: "center", fontSize: ".78rem" }}>{s.lastDay || s.start || "—"}</td>
                  <td style={{ fontWeight: 600, color: statusColor }}>{timeStr}</td>
                  <td style={{ fontSize: ".72rem", color: "#888", maxWidth: 180 }}>{s.notes}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>📅 6-Month Headcount Forecast</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="timeline-table">
          <thead><tr><th>Metric</th>{monthCells.map((m, i) => <th key={i}>{m.label}</th>)}</tr></thead>
          <tbody>
            {["Lead Intern", "Intern 2025", "Intern 2026", "Careerist", "Incoming"].map((role) => (
              <tr key={role}>
                <td style={{ fontWeight: 600 }}>{role}</td>
                {monthCells.map((m, i) => {
                  const monthEnd = new Date(m.yi, m.mi + 1, 0)
                  const monthStart = new Date(m.yi, m.mi, 1)
                  let count = 0
                  if (role === "Incoming") count = incoming.filter((s) => { const st = d(s.start); if (!st || st > monthEnd) return false; return addDays(st, orientDays) <= monthEnd }).length
                  else count = allStaff.filter((s) => { if (s.role !== role) return false; const ld = d(s.lastDay); if (ld && ld < monthStart) return false; return true }).length
                  return <td key={i} style={{ textAlign: "center", color: count === 0 ? "#d9534f" : "#333", fontWeight: count === 0 ? 700 : 400 }}>{count}</td>
                })}
              </tr>
            ))}
            <tr><td style={{ color: "#d9534f" }}>Departures</td>{monthCells.map((m, i) => { const ms = new Date(m.yi, m.mi, 1), me = new Date(m.yi, m.mi + 1, 0); const deps = allStaff.filter((s) => { const ld = d(s.lastDay); return ld && ld >= ms && ld <= me }); return <td key={i} style={{ textAlign: "center", color: "#d9534f", fontSize: ".75rem" }} title={deps.map((s) => s.init).join(", ")}>{deps.length ? "-" + deps.length : "—"}</td> })}</tr>
            <tr><td style={{ color: "#2ecc40" }}>Arrivals</td>{monthCells.map((m, i) => { const ms = new Date(m.yi, m.mi, 1), me = new Date(m.yi, m.mi + 1, 0); const arrs = incoming.filter((s) => { const st = d(s.start); return st && st >= ms && st <= me }); return <td key={i} style={{ textAlign: "center", color: "#2ecc40", fontSize: ".75rem" }} title={arrs.map((s) => s.name.split(" ")[0]).join(", ")}>{arrs.length ? "+" + arrs.length : "—"}</td> })}</tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 24 }}>🚨 Recruiting Timeline</h3>
      <RecruitingTimeline allStaff={allStaff} incoming={incoming} today={today} />
    </div>
  )
}

function RecruitingTimeline({ allStaff, incoming, today }: { allStaff: any[]; incoming: any[]; today: Date }) {
  const leadWeeks = 5
  const departing = allStaff.filter((s) => s.lastDay && !s.departed).sort((a, b) => a.daysLeft - b.daysLeft)
  if (!departing.length) return <div className="callout" style={{ borderLeftColor: "#2ecc40", background: "#f0fff4" }}>No departures scheduled. Recruiting timeline clear.</div>
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {departing.map((s, i) => {
        const ld = d(s.lastDay)!
        const recruitBy = new Date(ld.getTime() - leadWeeks * 7 * DAY_MS)
        const recruitDaysLeft = Math.max(0, Math.round((recruitBy.getTime() - today.getTime()) / DAY_MS))
        const urgency = recruitDaysLeft <= 0 ? "overdue" : recruitDaysLeft <= 14 ? "urgent" : recruitDaysLeft <= 30 ? "soon" : "ok"
        const urgCol = urgency === "overdue" ? "#d9534f" : urgency === "urgent" ? "#f5a623" : urgency === "soon" ? "#f59e0b" : "#2ecc40"
        const urgLabel = urgency === "overdue" ? "🚨 OVERDUE" : urgency === "urgent" ? "⚠️ URGENT" : urgency === "soon" ? "📅 SOON" : "✅ ON TRACK"
        const covered = incoming.some((inc) => { const st = d(inc.start); return st && st <= ld })
        return (
          <div key={i} style={{ background: "#fff", border: urgency === "overdue" || urgency === "urgent" ? `2px solid ${urgCol}` : "1px solid #ddd", borderRadius: 8, padding: "12px 16px", minWidth: 180, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontWeight: 700 }}>{s.name}</span><span style={{ fontSize: ".68rem", fontWeight: 600, color: urgCol }}>{urgLabel}</span></div>
            <div style={{ fontSize: ".75rem", color: "#888" }}>{s.role} · {s.init}</div>
            <div style={{ fontSize: ".78rem", marginTop: 6 }}><strong>Last Day:</strong> {s.lastDay}</div>
            <div style={{ fontSize: ".78rem" }}><strong>Recruit By:</strong> <span style={{ color: urgCol, fontWeight: 600 }}>{recruitBy.toISOString().slice(0, 10)}</span></div>
            <div style={{ fontSize: ".72rem", marginTop: 6, paddingTop: 4, borderTop: "1px solid #eee", color: covered ? "#2ecc40" : "#d9534f", fontWeight: 600 }}>{covered ? "✓ Incoming replacement lined up" : "✗ No replacement yet"}</div>
          </div>
        )
      })}
    </div>
  )
}
