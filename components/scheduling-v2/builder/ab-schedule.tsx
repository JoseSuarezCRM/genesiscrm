"use client"

import { Fragment, useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { SubTabs } from "@/components/scheduling-v2/shared"
import { DAYS } from "@/lib/scheduling/constants"
import type { WeekSchedule } from "@/lib/scheduling/types"

function parseCell(v: string): string[] {
  return v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : []
}

function ScheduleGrid({ which, pending }: { which: "A" | "B"; pending?: boolean }) {
  const { data, update } = useScheduling()
  const schedKey = pending ? (which === "A" ? "pendingScheduleA" : "pendingScheduleB") : which === "A" ? "scheduleA" : "scheduleB"
  const sched = (data as any)[schedKey] as WeekSchedule | null
  if (!sched) return null

  const setCell = (code: string, day: string, val: string) =>
    update((dd) => {
      const s = (dd as any)[schedKey] as WeekSchedule
      if (!s[code]) s[code] = {}
      s[code][day] = parseCell(val)
    })

  let surgSep = false
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="sched-grid">
        <thead><tr><th>{pending ? "PENDING " : ""}{which} WEEK</th>{DAYS.map((day) => <th key={day}>{day}</th>)}<th style={{ width: 65 }}>Days</th></tr></thead>
        <tbody>
          {data.clinicOrder.map((code) => {
            const meta = data.clinicMeta[code]
            if (!meta) return null
            const s = sched[code] || {}
            let used = 0
            const isSurg = meta.isSurgery
            const sep = isSurg && !surgSep
            if (sep) surgSep = true
            const cells = DAYS.map((day) => {
              const provs = s[day] || []
              if (provs.length) used++
              const hasHigh = provs.some((init) => { const p = data.providers.find((pr) => pr.init === init); return p && p.ptsDay > 30 })
              const bg = provs.length === 0 ? (isSurg ? "#fef8f8" : "#fafafa") : hasHigh ? "#fff8e1" : isSurg ? "#fce8e8" : "#f0fff4"
              return (
                <td key={day} style={{ background: bg }}>
                  <div className="sched-cell">
                    <input type="text" defaultValue={provs.join(", ")} className={provs.join(", ") ? "" : "empty"} onBlur={(e) => setCell(code, day, e.target.value)} />
                    {provs.length > 1 && <div className="sched-provider-count">{provs.length}</div>}
                  </div>
                </td>
              )
            })
            return (
              <Fragment key={code}>
                {sep && <tr><td colSpan={DAYS.length + 2} style={{ background: "#1a1a2e", color: "#fff", padding: "5px 10px", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600 }}>🏥 Surgery Locations</td></tr>}
                <tr>
                  <td className="clinic-label" style={isSurg ? { background: "#fef2f2" } : undefined}>{meta.full}{isSurg && <span style={{ background: "#991b1b", color: "#fff", fontSize: ".58rem", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>SURGERY</span>}<span className="contract-note">{code}</span></td>
                  {cells}
                  <td style={{ textAlign: "center", fontWeight: 700, fontSize: ".84rem" }}>{used}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScheduleSummary({ which }: { which: "A" | "B" }) {
  const { data } = useScheduling()
  const sched = which === "A" ? data.scheduleA : data.scheduleB
  const provDays: Record<string, number> = {}
  for (const code of data.clinicOrder) { const s = sched[code] || {}; for (const day of DAYS) (s[day] || []).forEach((i) => (provDays[i] = (provDays[i] || 0) + 1)) }
  const conflicts: { init: string; day: string; clinics: string[] }[] = []
  for (const day of DAYS) {
    const pd: Record<string, string[]> = {}
    for (const c of data.clinicOrder) (sched[c]?.[day] || []).forEach((i) => (pd[i] = pd[i] || []).push(c))
    for (const i in pd) if (pd[i].length > 1) conflicts.push({ init: i, day, clinics: pd[i] })
  }
  return (
    <div className="sched-summary">
      <div className="sched-summary-card" style={{ flex: 1 }}>
        <h4>Provider Days — {which} Week</h4>
        {Object.entries(provDays).sort((a, b) => b[1] - a[1]).map(([init, count]) => {
          const p = data.providers.find((pr) => pr.init === init)
          const exp = p ? p.clinicDays : 0
          const col = count > exp ? "#d9534f" : count < exp ? "#f5a623" : "#2ecc40"
          return <div className="prov-sched-row" key={init}><span>{p ? p.name : init} <span style={{ color: "#888" }}>({init})</span></span><span style={{ fontWeight: 600, color: col }}>{count}d / {exp}d</span></div>
        })}
      </div>
      {conflicts.length > 0 && (
        <div className="sched-summary-card" style={{ borderColor: "#e8c0c0", background: "#fff5f5" }}>
          <h4 style={{ color: "#d9534f" }}>Conflicts</h4>
          {conflicts.map((c, i) => { const p = data.providers.find((pr) => pr.init === c.init); return <div key={i} style={{ fontSize: ".79rem", color: "#d9534f", padding: "2px 0" }}><strong>{p ? p.name : c.init}</strong> double-booked {c.day}: {c.clinics.map((x) => data.clinicMeta[x]?.full || x).join(" & ")}</div> })}
        </div>
      )}
    </div>
  )
}

export default function ABSchedule() {
  const { data, update } = useScheduling()
  const [sub, setSub] = useState("current")
  const [week, setWeek] = useState<"A" | "B">("A")
  const [pendWeek, setPendWeek] = useState<"A" | "B">("A")

  const copyAtoB = () => update((dd) => {
    for (const c of dd.clinicOrder) { if (!dd.scheduleA[c]) continue; dd.scheduleB[c] = {}; for (const day of DAYS) dd.scheduleB[c][day] = [...(dd.scheduleA[c][day] || [])] }
  })

  const initPending = () => update((dd) => {
    if (dd.pendingScheduleA) return
    dd.pendingScheduleA = {}; dd.pendingScheduleB = {}
    for (const c of dd.clinicOrder) { dd.pendingScheduleA[c] = {}; dd.pendingScheduleB[c] = {}; for (const day of DAYS) { dd.pendingScheduleA[c][day] = [...(dd.scheduleA[c]?.[day] || [])]; dd.pendingScheduleB[c][day] = [...(dd.scheduleB[c]?.[day] || [])] } }
  })

  const copyCurrentToPending = () => update((dd) => {
    dd.pendingScheduleA = {}; dd.pendingScheduleB = {}
    for (const c of dd.clinicOrder) { dd.pendingScheduleA![c] = {}; dd.pendingScheduleB![c] = {}; for (const day of DAYS) { dd.pendingScheduleA![c][day] = [...(dd.scheduleA[c]?.[day] || [])]; dd.pendingScheduleB![c][day] = [...(dd.scheduleB[c]?.[day] || [])] } }
  })

  const activatePending = () => {
    if (!data.pendingScheduleStartDate) { alert("Please set a start date first."); return }
    if (!confirm("Activate the pending schedule? This replaces the current A/B schedule.")) return
    update((dd) => {
      for (const c of dd.clinicOrder) { dd.scheduleA[c] = {}; dd.scheduleB[c] = {}; for (const day of DAYS) { dd.scheduleA[c][day] = [...(dd.pendingScheduleA?.[c]?.[day] || [])]; dd.scheduleB[c][day] = [...(dd.pendingScheduleB?.[c]?.[day] || [])] } }
      dd.pendingScheduleA = null; dd.pendingScheduleB = null; dd.pendingScheduleStartDate = ""
    })
  }

  return (
    <div>
      <SubTabs tabs={[{ key: "current", label: "Current A/B Schedule" }, { key: "pending", label: "📝 New / Pending Schedule" }]} active={sub} onChange={(k) => { setSub(k); if (k === "pending") initPending() }} />
      {sub === "current" ? (
        <div>
          <div className="callout-blue">
            <strong>A Week:</strong> JZ active full week. JW Tuesday at WG. DB Saturday at OB.<br />
            <strong>B Week:</strong> JZ off. MC Tuesday at WG. DB Saturday at OB.
          </div>
          <div className="sched-controls">
            <button className={"btn-week" + (week === "A" ? " active" : "")} onClick={() => setWeek("A")}>A Week</button>
            <button className={"btn-week" + (week === "B" ? " active" : "")} onClick={() => setWeek("B")}>B Week</button>
            <span style={{ color: "#888", fontSize: ".79rem" }}>|</span>
            <button className="btn-add" style={{ margin: 0 }} onClick={copyAtoB}>Copy A → B</button>
          </div>
          <ScheduleGrid which={week} />
          <ScheduleSummary which={week} />
        </div>
      ) : (
        <div>
          <div className="callout" style={{ borderLeftColor: "#6366f1", background: "#f0f0ff" }}>
            <strong>New Schedule Preview.</strong> Set a start date for when this new A/B rotation takes effect.
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div><label className="sm-label">Start Date</label><input type="date" value={data.pendingScheduleStartDate} style={{ width: 160 }} onChange={(e) => update((dd) => { dd.pendingScheduleStartDate = e.target.value })} /></div>
            <div className="sched-controls" style={{ marginBottom: 0 }}>
              <button className={"btn-week" + (pendWeek === "A" ? " active" : "")} onClick={() => setPendWeek("A")}>A Week</button>
              <button className={"btn-week" + (pendWeek === "B" ? " active" : "")} onClick={() => setPendWeek("B")}>B Week</button>
              <button className="btn-add" style={{ margin: 0 }} onClick={copyCurrentToPending}>Copy Current → Pending</button>
              <button className="btn-add" style={{ margin: 0, background: "#6366f1", color: "#fff", borderColor: "#6366f1" }} onClick={activatePending}>✓ Activate Pending Schedule</button>
            </div>
          </div>
          <ScheduleGrid which={pendWeek} pending />
        </div>
      )}
    </div>
  )
}
