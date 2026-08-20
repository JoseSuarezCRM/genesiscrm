"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { SubTabs } from "@/components/scheduling-v2/shared"
import { d, monday, addDays, toISODate } from "@/lib/scheduling/dates"
import { iaGetActiveInterns } from "@/lib/scheduling/assign-interns"

export default function SurgeryShadowing() {
  const [sub, setSub] = useState("locations")
  return (
    <div>
      <div className="callout">Track surgery shadowing assignments for MAs/interns. Add locations, assign interns to dates, and monitor exposure.</div>
      <div className="xrt-subtabs no-print">
        {[{ key: "locations", label: "Shadowing Locations" }, { key: "weekly", label: "Weekly Schedule" }, { key: "log", label: "Shadowing Log" }, { key: "counts", label: "Intern Counts" }].map((t) => (
          <div key={t.key} className={"xrt-subtab" + (sub === t.key ? " active" : "")} onClick={() => setSub(t.key)}>{t.label}</div>
        ))}
      </div>
      {sub === "locations" && <Locations />}
      {sub === "weekly" && <Weekly />}
      {sub === "log" && <Log />}
      {sub === "counts" && <Counts />}
    </div>
  )
}

function Locations() {
  const { data, update } = useScheduling()
  return (
    <div>
      <h2>Surgery Shadowing Locations</h2>
      <div className="surg-locations">
        {data.surgLocations.map((loc, i) => (
          <div className="surg-loc-row" key={i}>
            <input value={loc.abbrev} style={{ width: 60, textAlign: "center", fontWeight: 700 }} onChange={(e) => update((dd) => { dd.surgLocations[i].abbrev = e.target.value })} />
            <input value={loc.name} style={{ flex: 1 }} placeholder="Location name" onChange={(e) => update((dd) => { dd.surgLocations[i].name = e.target.value })} />
            <input value={loc.provider || ""} style={{ width: 140 }} placeholder="Surgeon/Provider" onChange={(e) => update((dd) => { dd.surgLocations[i].provider = e.target.value })} />
            <input value={loc.notes || ""} style={{ width: 160 }} placeholder="Notes" onChange={(e) => update((dd) => { dd.surgLocations[i].notes = e.target.value })} />
            <button className="btn-x" onClick={() => update((dd) => { dd.surgLocations.splice(i, 1) })}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn-add" onClick={() => update((dd) => { dd.surgLocations.push({ name: "", abbrev: "", provider: "", notes: "" }) })}>+ Add Location</button>
    </div>
  )
}

function Weekly() {
  const { data, ephemeral, setEphemeral, update } = useScheduling()
  const weekStart = ephemeral.surgWeekStart ? monday(d(ephemeral.surgWeekStart)!) : monday(d(data.settings.startWeek) || new Date())
  const wk = toISODate(weekStart)
  const days = Array.from({ length: 5 }).map((_, i) => { const dt = addDays(weekStart, i); return { dayIdx: i, label: ["MON", "TUE", "WED", "THU", "FRI"][i], dateStr: dt.getMonth() + 1 + "/" + dt.getDate(), date: dt } })
  const interns = iaGetActiveInterns(data, weekStart)
  const setWeek = (iso: string) => setEphemeral((e) => { e.surgWeekStart = toISODate(monday(d(iso)!)) })

  const saveWeek = () => {
    let count = 0
    update((dd) => {
      dd.surgLocations.forEach((loc) => {
        days.forEach((day) => {
          const key = loc.abbrev + "-" + day.dayIdx + "-" + wk
          const intern = dd.surgAssignments[key]
          if (intern) {
            const dateStr = toISODate(day.date)
            if (!dd.surgLog.find((l) => l.date === dateStr && l.location === loc.abbrev && l.intern === intern)) {
              const io = interns.find((i) => i.key === intern)
              dd.surgLog.push({ date: dateStr, location: loc.abbrev, locationName: loc.name, intern, internName: io ? io.name : intern, provider: loc.provider || "", notes: "" })
              count++
            }
          }
        })
      })
    })
    alert(count > 0 ? `${count} new shadowing assignment(s) saved to log.` : "No new assignments to save.")
  }

  return (
    <div>
      <h2>Weekly Shadowing Assignments</h2>
      <div className="ia-week-nav no-print">
        <label style={{ fontWeight: 600, fontSize: ".82rem" }}>Week of:</label>
        <input type="date" value={wk} onChange={(e) => setWeek(e.target.value)} />
        <button className="btn-add" style={{ margin: 0 }} onClick={() => setEphemeral((e) => { e.surgWeekStart = toISODate(addDays(weekStart, -7)) })}>← Prev</button>
        <button className="btn-add" style={{ margin: 0 }} onClick={() => setEphemeral((e) => { e.surgWeekStart = toISODate(addDays(weekStart, 7)) })}>Next →</button>
        <button className="btn-add" style={{ margin: 0, background: "#8b0000", color: "#fff", borderColor: "#8b0000" }} onClick={saveWeek}>💾 Save Week</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="surg-tracker-table">
          <thead><tr><th>Location</th>{days.map((d2) => <th key={d2.dayIdx}>{d2.label}<br /><span style={{ fontWeight: 400, fontSize: ".65rem" }}>{d2.dateStr}</span></th>)}</tr></thead>
          <tbody>
            {data.surgLocations.map((loc) => (
              <tr key={loc.abbrev + loc.name}>
                <td className="st-name">{loc.name} <span style={{ color: "#888", fontWeight: 400, fontSize: ".73rem" }}>({loc.abbrev})</span>{loc.provider && <div style={{ fontSize: ".7rem", color: "#666" }}>{loc.provider}</div>}</td>
                {days.map((d2) => {
                  const key = loc.abbrev + "-" + d2.dayIdx + "-" + wk
                  const assigned = data.surgAssignments[key] || ""
                  return (
                    <td key={d2.dayIdx}>
                      <select className={"surg-cell-select" + (assigned ? " assigned" : "")} value={assigned} onChange={(e) => update((dd) => { if (e.target.value) dd.surgAssignments[key] = e.target.value; else delete dd.surgAssignments[key] })}>
                        <option value="">—</option>
                        {interns.map((i) => <option key={i.key} value={i.key}>{i.name} ({i.init})</option>)}
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Log() {
  const { data, update } = useScheduling()
  if (!data.surgLog.length) return <div><h2>Shadowing Log</h2><p style={{ color: "#888", textAlign: "center", padding: 30 }}>No shadowing entries yet.</p></div>
  const sorted = [...data.surgLog].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div>
      <h2>Shadowing Log</h2>
      <table className="surg-log-table">
        <thead><tr><th>Date</th><th>Location</th><th>Intern</th><th>Surgeon/Provider</th><th></th></tr></thead>
        <tbody>
          {sorted.map((entry, i) => (
            <tr key={i}><td>{entry.date}</td><td>{entry.locationName || entry.location}</td><td><strong>{entry.internName || entry.intern}</strong></td><td>{entry.provider || "—"}</td>
              <td><button className="btn-x" onClick={() => update((dd) => { const idx = dd.surgLog.findIndex((e) => e.date === entry.date && e.location === entry.location && e.intern === entry.intern); if (idx >= 0) dd.surgLog.splice(idx, 1) })}>✕</button></td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: ".75rem", color: "#888" }}>{data.surgLog.length} total entries</div>
    </div>
  )
}

function Counts() {
  const { data } = useScheduling()
  const interns = iaGetActiveInterns(data, monday(new Date()))
  if (!data.surgLog.length) return <div><h2>Intern Shadowing Counts</h2><p style={{ color: "#888", textAlign: "center", padding: 30 }}>No shadowing data yet.</p></div>
  const counts: Record<string, Record<string, number>> = {}
  data.surgLog.forEach((e) => { if (!counts[e.intern]) counts[e.intern] = {}; counts[e.intern][e.location] = (counts[e.intern][e.location] || 0) + 1 })
  const locs = data.surgLocations.map((l) => l.abbrev)
  return (
    <div>
      <h2>Intern Shadowing Counts</h2>
      <table className="surg-count-table">
        <thead><tr><th>Intern</th>{locs.map((l) => { const loc = data.surgLocations.find((x) => x.abbrev === l); return <th key={l}>{loc ? loc.name : l}</th> })}<th>Total</th></tr></thead>
        <tbody>
          {interns.map((intern) => {
            const ic = counts[intern.key] || {}
            const total = Object.values(ic).reduce((s, v) => s + v, 0)
            return <tr key={intern.key}><td className="sc-name">{intern.name} ({intern.init})</td>{locs.map((l) => { const c = ic[l] || 0; return <td key={l} style={{ fontWeight: c ? 600 : 400, background: c ? "#e8f5e8" : undefined }}>{c || "—"}</td> })}<td style={{ fontWeight: 700 }}>{total}</td></tr>
          })}
        </tbody>
      </table>
    </div>
  )
}
