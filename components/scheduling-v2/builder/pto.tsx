"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { MONTHS } from "@/lib/scheduling/constants"
import { d, toISODate } from "@/lib/scheduling/dates"
import { isOnPTO } from "@/lib/scheduling/providers"

export default function PtoExceptions() {
  const { data, update } = useScheduling()

  // People lists
  const ptoPeople = [
    ...data.providers.map((p) => ({ name: p.name, init: p.init })),
    ...data.currentStaff.map((s) => ({ name: s.name, init: s.init || s.name })),
    ...data.incomingInterns.map((s) => ({ name: s.name, init: s.name })),
  ].filter((v, i, a) => v.name && a.findIndex((x) => x.name === v.name) === i)
  const provPeople = data.providers.filter((p) => p.init)
  const staffPeople = [...provPeople.map((p) => ({ name: p.name, init: p.init })), ...data.currentStaff.map((s) => ({ name: s.name, init: s.init || s.name }))]

  // PTO form
  const [ptoWho, setPtoWho] = useState("")
  const [ptoStart, setPtoStart] = useState("")
  const [ptoEnd, setPtoEnd] = useState("")
  const [ptoNote, setPtoNote] = useState("")
  const addPto = () => {
    const who = ptoWho || ptoPeople[0]?.init
    if (!who || !ptoStart) return
    update((dd) => { dd.ptoEntries.push({ person: who, startDate: ptoStart, endDate: ptoEnd || ptoStart, note: ptoNote }) })
    setPtoNote("")
  }

  // Override form
  const [ovWho, setOvWho] = useState("")
  const [ovDate, setOvDate] = useState("")
  const [ovAction, setOvAction] = useState<"out-all" | "out-clinic" | "cover">("out-all")
  const [ovClinic, setOvClinic] = useState("")
  const [ovNote, setOvNote] = useState("")
  const addOverride = () => {
    const who = ovWho || provPeople[0]?.init
    if (!who || !ovDate) return
    if ((ovAction === "out-clinic" || ovAction === "cover") && !ovClinic) { alert("Please select a clinic."); return }
    update((dd) => { dd.scheduleOverrides.push({ date: ovDate, init: who, action: ovAction, clinic: ovAction === "out-all" ? "" : ovClinic, note: ovNote }) })
    setOvNote("")
  }

  // Recurring form
  const [rrWho, setRrWho] = useState("")
  const [rrFreq, setRrFreq] = useState<any>("1st")
  const [rrDay, setRrDay] = useState(1)
  const [rrAction, setRrAction] = useState<"out-all" | "out-clinic" | "at-clinic">("out-all")
  const [rrClinic, setRrClinic] = useState("")
  const [rrStart, setRrStart] = useState("")
  const [rrNote, setRrNote] = useState("")
  const addRecurring = () => {
    const who = rrWho || staffPeople[0]?.init
    if (!who) return
    update((dd) => { dd.recurringRules.push({ person: who, freq: rrFreq, dayOfWeek: rrDay, action: rrAction, clinic: rrAction === "out-all" ? "" : rrClinic, startDate: rrStart, note: rrNote }) })
    setRrNote("")
  }

  const nameOf = (init: string) => data.providers.find((p) => p.init === init)?.name || data.currentStaff.find((s) => (s.init || s.name) === init)?.name || init
  const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

  return (
    <div>
      <div className="callout">Manage PTO and one-off coverage changes for all staff. These affect the Master Schedule and assignment engines.</div>

      {/* PTO LOG */}
      <div className="pto-panel">
        <h3 style={{ marginBottom: 10 }}>PTO / Exceptions Log</h3>
        <div>
          {data.ptoEntries.length === 0 ? <div style={{ color: "#888", fontSize: ".8rem", fontStyle: "italic" }}>No PTO entries yet.</div> : data.ptoEntries.map((e, i) => (
            <div className="pto-entry" key={i}><span className="pto-badge">PTO</span><strong>{nameOf(e.person)}</strong><span style={{ color: "#666" }}>{e.startDate === e.endDate ? e.startDate : e.startDate + " → " + e.endDate}</span>{e.note && <span style={{ color: "#888" }}>{e.note}</span>}<button className="btn-x" onClick={() => update((dd) => { dd.ptoEntries.splice(i, 1) })}>✕</button></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
          <div><label className="sm-label">Person</label><select value={ptoWho} onChange={(e) => setPtoWho(e.target.value)} style={{ width: 180 }}>{ptoPeople.map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}</select></div>
          <div><label className="sm-label">Start Date</label><input type="date" value={ptoStart} onChange={(e) => setPtoStart(e.target.value)} style={{ width: 140 }} /></div>
          <div><label className="sm-label">End Date</label><input type="date" value={ptoEnd} onChange={(e) => setPtoEnd(e.target.value)} style={{ width: 140 }} /></div>
          <div><label className="sm-label">Note</label><input type="text" value={ptoNote} onChange={(e) => setPtoNote(e.target.value)} placeholder="Vacation..." style={{ width: 200 }} /></div>
          <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={addPto}>+ Add</button>
        </div>
      </div>

      {/* OVERRIDES */}
      <div className="pto-panel">
        <h3 style={{ marginBottom: 4 }}>One-off Coverage Changes</h3>
        <p style={{ fontSize: ".75rem", color: "#888", marginBottom: 10 }}>Remove a provider from their normal schedule on a day, or add them to cover a clinic.</p>
        <div>
          {data.scheduleOverrides.length === 0 ? <div style={{ color: "#888", fontSize: ".8rem", fontStyle: "italic" }}>No overrides yet.</div> : data.scheduleOverrides.map((e, i) => {
            const badge = e.action === "cover" ? <span style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 3, padding: "1px 6px", fontSize: ".68rem", color: "#065f46", fontWeight: 600 }}>COVER</span> : <span style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 3, padding: "1px 6px", fontSize: ".68rem", color: "#991b1b", fontWeight: 600 }}>OUT</span>
            const clinicLbl = e.clinic ? data.clinicMeta[e.clinic]?.full + " (" + e.clinic + ")" : "All clinics"
            return <div className="pto-entry" key={i}>{badge}<strong>{nameOf(e.init)}</strong><span style={{ color: "#555" }}>{e.date}</span><span style={{ color: "#666" }}>{clinicLbl}</span>{e.note && <span style={{ color: "#888" }}>{e.note}</span>}<button className="btn-x" onClick={() => update((dd) => { dd.scheduleOverrides.splice(i, 1) })}>✕</button></div>
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
          <div><label className="sm-label">Provider</label><select value={ovWho} onChange={(e) => setOvWho(e.target.value)} style={{ width: 170 }}>{provPeople.map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}</select></div>
          <div><label className="sm-label">Date</label><input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} style={{ width: 140 }} /></div>
          <div><label className="sm-label">Type</label><select value={ovAction} onChange={(e) => setOvAction(e.target.value as any)} style={{ width: 175 }}><option value="out-all">🚫 Full day out</option><option value="out-clinic">🚫 Out at clinic</option><option value="cover">➕ Cover a clinic</option></select></div>
          {ovAction !== "out-all" && <div><label className="sm-label">Clinic</label><select value={ovClinic} onChange={(e) => setOvClinic(e.target.value)} style={{ width: 150 }}><option value="">— Select —</option>{data.clinicOrder.map((c) => <option key={c} value={c}>{data.clinicMeta[c]?.full} ({c})</option>)}</select></div>}
          <div><label className="sm-label">Note</label><input type="text" value={ovNote} onChange={(e) => setOvNote(e.target.value)} placeholder="Surgery..." style={{ width: 190 }} /></div>
          <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={addOverride}>+ Add</button>
        </div>
      </div>

      {/* RECURRING */}
      <div className="pto-panel" style={{ borderColor: "#c4b5fd" }}>
        <h3 style={{ marginBottom: 4 }}>🔁 Recurring Rules</h3>
        <p style={{ fontSize: ".75rem", color: "#888", marginBottom: 10 }}>Repeating schedule exceptions — surgery days, recurring meetings, etc.</p>
        <div>
          {data.recurringRules.length === 0 ? <div style={{ color: "#888", fontSize: ".8rem", fontStyle: "italic" }}>No recurring rules yet.</div> : data.recurringRules.map((r, i) => {
            const clinicName = r.clinic ? data.clinicMeta[r.clinic]?.full || r.clinic : ""
            const actionStr = r.action === "out-all" ? "Out (all day)" : r.action === "out-clinic" ? "Out at " + clinicName : "At " + clinicName
            return <div className="rr-entry" key={i}><span className="rr-badge">🔁 Recurring</span><strong>{nameOf(r.person)}</strong><span style={{ color: "#666" }}>{r.freq} {dayNames[r.dayOfWeek]}</span><span style={{ color: "#6b21a8" }}>{actionStr}</span>{r.note && <span style={{ color: "#888" }}>{r.note}</span>}{r.startDate && <span style={{ color: "#aaa", fontSize: ".72rem" }}>from {r.startDate}</span>}<button className="btn-x" onClick={() => update((dd) => { dd.recurringRules.splice(i, 1) })}>✕</button></div>
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
          <div><label className="sm-label">Person</label><select value={rrWho} onChange={(e) => setRrWho(e.target.value)} style={{ width: 180 }}>{staffPeople.map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}</select></div>
          <div><label className="sm-label">Frequency</label><select value={rrFreq} onChange={(e) => setRrFreq(e.target.value)} style={{ width: 130 }}><option value="1st">1st</option><option value="2nd">2nd</option><option value="3rd">3rd</option><option value="4th">4th</option><option value="last">Last</option><option value="every">Every</option><option value="every-other">Every Other</option></select></div>
          <div><label className="sm-label">Day</label><select value={rrDay} onChange={(e) => setRrDay(+e.target.value)} style={{ width: 130 }}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{dayNames[n]}</option>)}</select></div>
          <div><label className="sm-label">Type</label><select value={rrAction} onChange={(e) => setRrAction(e.target.value as any)} style={{ width: 150 }}><option value="out-all">🚫 Out (all day)</option><option value="out-clinic">🚫 Out at clinic</option><option value="at-clinic">📍 At clinic</option></select></div>
          {rrAction !== "out-all" && <div><label className="sm-label">Clinic</label><select value={rrClinic} onChange={(e) => setRrClinic(e.target.value)} style={{ width: 150 }}><option value="">— Select —</option>{data.clinicOrder.map((c) => <option key={c} value={c}>{data.clinicMeta[c]?.full} ({c})</option>)}</select></div>}
          <div><label className="sm-label">Start Date</label><input type="date" value={rrStart} onChange={(e) => setRrStart(e.target.value)} style={{ width: 140 }} /></div>
          <div><label className="sm-label">Note</label><input type="text" value={rrNote} onChange={(e) => setRrNote(e.target.value)} placeholder="Surgery..." style={{ width: 180 }} /></div>
          <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={addRecurring}>+ Add Rule</button>
        </div>
      </div>

      <PtoCalendar />
    </div>
  )
}

function PtoCalendar() {
  const { data } = useScheduling()
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const allPeople = [
    ...data.providers.map((p) => ({ name: p.name, init: p.init, type: "prov" as const })),
    ...data.currentStaff.map((s) => ({ name: s.name, init: s.init || s.name, type: "staff" as const })),
  ]

  const cells: React.ReactNode[] = []
  for (let i = 0; i < startDow; i++) cells.push(<td key={"pre" + i} className="other-month" />)
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = (startDow + day - 1) % 7
    const date = new Date(year, month, day)
    const isToday = date.getTime() === today.getTime()
    const isWeekend = dow === 0 || dow === 6
    const chips: React.ReactNode[] = []
    allPeople.forEach((person) => {
      if (isOnPTO(person.init, date, data.ptoEntries, data.recurringRules)) chips.push(<span key={person.init} className={"pto-chip " + (person.type === "prov" ? "prov" : "staff")} title={person.name}>{person.init}</span>)
    })
    const ds = toISODate(date)
    data.scheduleOverrides.filter((ov) => ov.date === ds && (ov.action === "out-all" || ov.action === "out-clinic")).forEach((ov) => {
      if (!isOnPTO(ov.init, date, data.ptoEntries, data.recurringRules)) chips.push(<span key={"ov" + ov.init + ov.clinic} className="pto-chip override" title={ov.note || "Out"}>{ov.init}</span>)
    })
    cells.push(
      <td key={day} className={(isWeekend ? "weekend " : "") + (isToday ? "today" : "")}>
        <div className="cal-day-num">{day}</div>{chips}
      </td>
    )
  }
  // build weeks
  const weeks: React.ReactNode[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(<tr key={i}>{cells.slice(i, i + 7)}</tr>)

  return (
    <div className="pto-panel" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 10 }}>📅 PTO Calendar</h3>
      <div className="pto-cal-nav">
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1) }}>← Prev</button>
        <span className="month-label">{MONTHS[month]} {year}</span>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1) }}>Next →</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="pto-cal-grid">
          <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>{weeks}</tbody>
        </table>
      </div>
    </div>
  )
}
