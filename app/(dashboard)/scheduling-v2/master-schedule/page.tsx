"use client"

import { useMemo, useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { ProvChip } from "@/components/scheduling-v2/shared"
import { DAYS } from "@/lib/scheduling/constants"
import { d, monday, addDays, fmtShort, weekType, getSchedForWeek } from "@/lib/scheduling/dates"
import { providerActive, isOnPTO, isOutOverride, getCoverOverrides } from "@/lib/scheduling/providers"
import { getStaffingRequirement } from "@/lib/scheduling/staffing"
import { iaGetActiveInterns } from "@/lib/scheduling/assign-interns"
import { xrtGetActiveXRTs } from "@/lib/scheduling/assign-xrt"
import { taskAssignees } from "@/lib/scheduling/tasks"

export default function MasterSchedulePage() {
  const { data, ephemeral, update } = useScheduling()
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>({ 0: true })

  let startDate = d(data.settings.startWeek) || monday(new Date())
  startDate = monday(startDate)
  const numWeeks = +data.settings.calWeeks || 26

  const allInterns = useMemo(() => iaGetActiveInterns(data, startDate), [data, startDate])
  const allXRTs = useMemo(() => xrtGetActiveXRTs(data, startDate), [data, startDate])

  const getOnCallWeek = (weekKey: string): Record<string, string> => {
    const v = data.onCallPASchedule[weekKey]
    if (!v) return {}
    if (typeof v === "string") { const o: Record<string, string> = {}; DAYS.forEach((dn) => (o[dn] = v)); return o }
    return v
  }
  const setOnCallAll = (weekKey: string, val: string) =>
    update((dd) => { const o: Record<string, string> = {}; DAYS.forEach((dn) => (o[dn] = val)); dd.onCallPASchedule[weekKey] = o })
  const setOnCallDay = (weekKey: string, day: string, val: string) =>
    update((dd) => {
      const cur = dd.onCallPASchedule[weekKey]
      const o: Record<string, string> = typeof cur === "string" ? Object.fromEntries(DAYS.map((dn) => [dn, cur])) : { ...(cur || {}) }
      o[day] = val
      dd.onCallPASchedule[weekKey] = o
    })

  return (
    <div className="section">
      <div className="callout">
        Full weekly schedule showing <strong>providers</strong>, <strong>interns</strong>, and <strong>XRTs</strong> at each clinic based on the A/B rotation + assignments. PTO and coverage changes reflect automatically.
      </div>
      {Array.from({ length: numWeeks }).map((_, wi) => {
        const weekStart = addDays(startDate, wi * 7)
        const wType = weekType(weekStart, data.settings.startWeek)
        const sched = getSchedForWeek(weekStart, data.settings.startWeek, data.scheduleA, data.scheduleB)
        const weekEnd = addDays(weekStart, 4)
        const weekKey = weekStart.toISOString().slice(0, 10)
        const ocData = getOnCallWeek(weekKey)
        const isOpen = !!openWeeks[wi]
        let gapCount = 0, overCount = 0, underCount = 0

        const rows: React.ReactNode[] = []
        let surgSep = false
        for (const code of data.clinicOrder) {
          const meta = data.clinicMeta[code]
          if (!meta) continue
          const s = sched[code] || {}
          const isSurg = meta.isSurgery
          if (isSurg && !surgSep) {
            surgSep = true
            rows.push(
              <tr key={"sep-" + code}><td colSpan={DAYS.length + 1} style={{ background: "#1a1a2e", color: "#fff", padding: "5px 10px", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 }}>🏥 Surgery Locations</td></tr>
            )
          }
          rows.push(
            <tr key={code}>
              <td className="cal-clinic-label" style={isSurg ? { background: "#fef2f2" } : undefined}>
                {meta.full}{isSurg && <span style={{ background: "#991b1b", color: "#fff", fontSize: ".58rem", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>SURGERY</span>} <span className="badge-contract">{code}</span>
              </td>
              {DAYS.map((day, di) => {
                const date = addDays(weekStart, di)
                const baseProvs = s[day] || []
                const active: string[] = [], onPTO: string[] = [], onOut: string[] = []
                baseProvs.forEach((init) => {
                  const p = data.providers.find((pr) => pr.init === init)
                  if (p && !providerActive(p, weekStart)) return
                  if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) { onPTO.push(init); return }
                  if (isOutOverride(init, date, code, data.scheduleOverrides, data.recurringRules)) { onOut.push(init); return }
                  active.push(init)
                })
                const covers = getCoverOverrides(date, code, data.scheduleOverrides)
                const scheduledCount = baseProvs.filter((init) => { const p = data.providers.find((pr) => pr.init === init); return !p || providerActive(p, weekStart) }).length
                const allActiveCount = active.length + covers.length
                const hasGap = scheduledCount > 0 && allActiveCount === 0 && onPTO.length + onOut.length > 0
                if (hasGap) gapCount++
                const isEmpty = scheduledCount === 0 && covers.length === 0

                let internChips: React.ReactNode[] = []
                let xrtChips: React.ReactNode[] = []
                let staffCount = 0
                if (di < 5) {
                  allInterns.forEach((intern) => {
                    if (ephemeral.iaAssignments[intern.key + "-" + di] === code) {
                      const pto = isOnPTO(intern.init, date, data.ptoEntries, data.recurringRules) || isOnPTO(intern.key, date, data.ptoEntries, data.recurringRules)
                      internChips.push(<span key={intern.key} className={"provider-chip intern" + (pto ? " on-pto" : "")} title={intern.name}>{intern.init}</span>)
                      if (!pto) staffCount++
                    }
                  })
                  allXRTs.forEach((xrt) => {
                    const ld = d(xrt.lastDay || "")
                    if (ld && ld < weekStart) return
                    if (data.xrtAssignments[xrt.key + "-" + di] === code) {
                      const pto = isOnPTO(xrt.init, date, data.ptoEntries, data.recurringRules) || isOnPTO(xrt.key, date, data.ptoEntries, data.recurringRules)
                      xrtChips.push(<span key={xrt.key} className={"provider-chip xrt" + (pto ? " on-pto" : "")} title={xrt.name + " (XR Tech)"}>{xrt.init}</span>)
                      if (!pto) staffCount++
                    }
                  })
                }

                // Staffing over/under badge
                let staffBadge: React.ReactNode = null
                if (!isSurg && di < 5 && allActiveCount > 0) {
                  const vol = ephemeral.iaVolumes[code + "-" + di] || 0
                  const need = getStaffingRequirement(vol, data.staffingRules, data.staffingRulesExtra).totalStaff
                  if (need > 0 && staffCount > 0) {
                    const diff = staffCount - need
                    if (diff > 0) { overCount++; staffBadge = <div style={{ fontSize: ".55rem", color: "#b45309", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 3, padding: "0 3px", marginTop: 2, textAlign: "center", fontWeight: 600 }}>+{diff} over</div> }
                    else if (diff < 0) { underCount++; staffBadge = <div style={{ fontSize: ".55rem", color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 3, padding: "0 3px", marginTop: 2, textAlign: "center", fontWeight: 600 }}>{diff} under</div> }
                  }
                }

                const cellBg = hasGap ? "#fff0f0" : isSurg ? (isEmpty ? "#fef2f2" : "#fce4e4") : isEmpty && !internChips.length && !xrtChips.length ? "#fafafa" : ""
                return (
                  <td key={day} style={cellBg ? { background: cellBg } : undefined}>
                    {active.map((init) => <ProvChip key={init} init={init} providers={data.providers} />)}
                    {onPTO.map((init) => <ProvChip key={"pto" + init} init={init} providers={data.providers} modClass="on-pto" title="PTO" />)}
                    {onOut.map((init) => <ProvChip key={"out" + init} init={init} providers={data.providers} modClass="on-out" title="Out" />)}
                    {covers.map((c) => <ProvChip key={"cov" + c.init} init={c.init} providers={data.providers} modClass="on-cover" title={"Covering" + (c.note ? " — " + c.note : "")} />)}
                    {(active.length || onPTO.length || onOut.length || covers.length) && (internChips.length || xrtChips.length) ? <div style={{ borderTop: "1px dashed #ddd", margin: "2px 0", paddingTop: 1 }} /> : null}
                    {internChips}
                    {xrtChips}
                    {staffBadge}
                  </td>
                )
              })}
            </tr>
          )
        }

        // Task rows (read-only display; editing lives in Schedule Builder → Tasks)
        if (data.dailyTasks.length) {
          rows.push(<tr key="task-sep"><td colSpan={DAYS.length + 1} style={{ background: "#1a1a2e", color: "#fff", padding: "6px 10px", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 }}>📋 Task Assignments</td></tr>)
          data.dailyTasks.forEach((task, ti) => {
            if (!task.name) return
            rows.push(
              <tr key={"task-" + ti}>
                <td className="cal-clinic-label" style={{ background: "#f9f5ff", color: "#6b4c9a", fontSize: ".78rem" }}>{task.name}</td>
                {DAYS.map((day) => {
                  const assigned = day === "SAT" ? [] : taskAssignees((task as any)[day])
                  return <td key={day} style={{ verticalAlign: "middle" }}>{assigned.length ? assigned.map((a, k) => <span key={k} className="task-chip">{a}</span>) : <span style={{ color: "#ccc", fontSize: ".72rem" }}>—</span>}</td>
                })}
              </tr>
            )
          })
        }

        // On-call PA row
        rows.push(
          <tr key="oncall">
            <td className="cal-clinic-label" style={{ background: "#fff5f5", color: "#991b1b", fontSize: ".78rem" }}>
              🚨 On-Call PA
              <div style={{ marginTop: 3 }}>
                <select style={{ width: 120, fontSize: ".68rem", padding: "2px 4px", border: "1px solid #ddd", borderRadius: 3, color: "#991b1b" }} value="" onChange={(e) => setOnCallAll(weekKey, e.target.value)}>
                  <option value="">Set all →</option>
                  {data.providers.map((p) => <option key={p.init} value={p.init}>{p.init}</option>)}
                </select>
              </div>
            </td>
            {DAYS.map((day) => {
              const val = ocData[day] || ""
              return (
                <td key={day} style={{ background: "#fff5f5", padding: 2 }}>
                  <select style={{ width: "100%", fontSize: ".76rem", padding: "3px 4px", border: `1px solid ${val ? "#fca5a5" : "#ddd"}`, borderRadius: 4, fontWeight: val ? 600 : 400, color: val ? "#991b1b" : "#888", background: val ? "#fff5f5" : "#fff" }} value={val} onChange={(e) => setOnCallDay(weekKey, day, e.target.value)}>
                    <option value="">—</option>
                    {data.providers.map((p) => <option key={p.init} value={p.init}>{p.init}</option>)}
                  </select>
                </td>
              )
            })}
          </tr>
        )

        return (
          <div className="cal-week-card" key={wi}>
            <div className="cal-week-header" onClick={() => setOpenWeeks((o) => ({ ...o, [wi]: !o[wi] }))}>
              <span className="week-label">{fmtShort(weekStart)} → {fmtShort(weekEnd)}</span>
              <span className="week-meta">
                <span className={"week-badge " + (wType === "A" ? "wk-a" : "wk-b")}>{wType} WEEK</span>
                <span style={{ color: "#ffa" }}>{gapCount > 0 ? gapCount + " gap" + (gapCount > 1 ? "s" : "") : "✓"}</span>
                {(overCount || underCount) ? <span style={{ fontSize: ".7rem" }}>{overCount ? `▲${overCount} over ` : ""}{underCount ? `▼${underCount} under` : ""}</span> : null}
                <span style={{ opacity: 0.6 }}>{isOpen ? "▲ collapse" : "▼ expand"}</span>
              </span>
            </div>
            {isOpen && (
              <div className="cal-week-body open">
                <table className="cal-grid">
                  <thead><tr><th>CLINIC</th>{DAYS.map((day, di) => { const dt = addDays(weekStart, di); return <th key={day}>{day}<br /><span style={{ fontWeight: 400, opacity: 0.7 }}>{dt.getMonth() + 1}/{dt.getDate()}</span></th> })}</tr></thead>
                  <tbody>{rows}</tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
