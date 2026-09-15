"use client"

import { useMemo, useState } from "react"
import { useScheduling } from "../store"
import { usePlannerToast } from "../toast"
import { MONTH_NAMES, WEEKDAY_NAMES } from "@/lib/scheduling/constants"
import { clinicToday, d, ymd } from "@/lib/scheduling/dates"
import { chipTextColor, getProvColor, isOnPTO, shortTime } from "@/lib/scheduling/providers"
import type { OverrideAction, RecurringFreq } from "@/lib/scheduling/types"

// Schedule Builder → PTO / Exceptions. Four panels from the dashboard: the PTO
// log, one-off coverage changes, recurring rules, and the month calendar that
// shows all three together.

export default function PtoExceptions() {
  return (
    <div>
      <div className="callout">
        Manage PTO and one-off coverage changes for <strong>all staff</strong> — providers, interns and MAs.
        These entries drive the Master Schedule and the assignment engines.
      </div>
      <PtoLog />
      <Overrides />
      <RecurringRules />
      <PtoCalendar />
    </div>
  )
}

/** Everyone who can have PTO: providers, staff and incoming, de-duplicated by name. */
function usePtoPeople() {
  const { data } = useScheduling()
  return useMemo(() => {
    const all = [
      ...data.providers.map((p) => ({ name: p.name, init: p.init })),
      ...data.currentStaff.map((s) => ({ name: s.name, init: s.init || s.name })),
      ...data.incomingInterns.map((s) => ({ name: s.name, init: s.name })),
    ]
    return all.filter((v, i, a) => v.name && a.findIndex((x) => x.name === v.name) === i)
  }, [data.providers, data.currentStaff, data.incomingInterns])
}

function PtoLog() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const people = usePtoPeople()
  const [who, setWho] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [note, setNote] = useState("")

  const add = () => {
    const person = who || people[0]?.init
    if (!person || !start) { toast("Pick a person and a start date.", "warn"); return }
    update((dd) => { dd.ptoEntries.push({ person, startDate: start, endDate: end || start, note }) })
    setNote("")
    toast(`PTO added for ${person}`, "success")
  }

  const nameOf = (key: string) =>
    data.providers.find((p) => p.init === key)?.name
    ?? data.currentStaff.find((s) => (s.init || s.name) === key)?.name
    ?? data.incomingInterns.find((s) => s.name === key)?.name
    ?? key

  return (
    <div className="pto-panel">
      <h3 style={{ marginBottom: 10 }}>PTO / Exceptions Log</h3>
      {data.ptoEntries.length === 0 ? (
        <div style={{ color: "var(--ink-faint)", fontSize: ".8rem", fontStyle: "italic" }}>No PTO entries yet.</div>
      ) : (
        data.ptoEntries.map((e, i) => (
          <div className="pto-entry" key={i}>
            <span className="pto-badge">PTO</span>
            <strong>{nameOf(e.person)}</strong>
            <span style={{ color: "var(--ink-muted)" }}>
              {e.startDate === e.endDate ? e.startDate : `${e.startDate} → ${e.endDate}`}
            </span>
            {e.note && <span style={{ color: "var(--ink-faint)" }}>{e.note}</span>}
            <button className="btn-x" onClick={() => update((dd) => { dd.ptoEntries.splice(i, 1) })}>×</button>
          </div>
        ))
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
        <Field label="Person">
          <select style={{ width: 180 }} value={who} onChange={(e) => setWho(e.target.value)}>
            {people.map((p) => (
              <option key={p.init} value={p.init}>{p.name}{p.init !== p.name ? ` (${p.init})` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Start Date"><input type="date" style={{ width: 140 }} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End Date"><input type="date" style={{ width: 140 }} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Note (optional)">
          <input type="text" placeholder="Vacation, conference…" style={{ width: 200 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={add}>+ Add</button>
      </div>
    </div>
  )
}

const OV_ACTIONS: { value: OverrideAction; label: string }[] = [
  { value: "out-all", label: "🚫 Full day out (all clinics)" },
  { value: "out-clinic", label: "🚫 Out at specific clinic" },
  { value: "cover", label: "➕ Cover a clinic" },
  { value: "late-start", label: "🕐 Late start" },
]

function Overrides() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const [init, setInit] = useState("")
  const [date, setDate] = useState("")
  const [action, setAction] = useState<OverrideAction>("out-all")
  const [clinic, setClinic] = useState("")
  const [time, setTime] = useState("11:00")
  const [note, setNote] = useState("")

  const needsClinic = action !== "out-all"
  const add = () => {
    const who = init || data.providers[0]?.init
    if (!who || !date) { toast("Pick a provider and a date.", "warn"); return }
    if (needsClinic && !clinic) { toast("Please select a clinic.", "warn"); return }
    update((dd) => {
      dd.scheduleOverrides.push({
        date, init: who, action, clinic: action === "out-all" ? "" : clinic, note,
        ...(action === "late-start" ? { time: time || "11:00" } : {}),
      })
    })
    setNote("")
    toast(`Override added for ${who} on ${date}`, "success")
  }

  return (
    <div className="pto-panel" style={{ borderColor: "var(--border-strong)" }}>
      <h3 style={{ marginBottom: 4 }}>One-off Coverage Changes</h3>
      <p style={{ fontSize: ".75rem", color: "var(--ink-faint)", marginBottom: 10 }}>
        Remove a provider from their normal schedule on a specific day (surgery, conference), add them to
        cover a clinic they&apos;re not usually at, or note that they start late.
      </p>

      {data.scheduleOverrides.length === 0 ? (
        <div style={{ color: "var(--ink-faint)", fontSize: ".8rem", fontStyle: "italic" }}>No overrides yet.</div>
      ) : (
        data.scheduleOverrides.map((e, i) => {
          const col = getProvColor(e.init, data.providers)
          const name = data.providers.find((p) => p.init === e.init)?.name ?? e.init
          return (
            <div className="pto-entry" key={i}>
              <OverrideBadge action={e.action} time={e.time} />
              <span className="provider-chip" style={{ background: col, borderColor: col, color: chipTextColor(col) }}>{e.init}</span>
              <strong>{name}</strong>
              <span style={{ color: "var(--ink-muted)" }}>{e.date}</span>
              <span style={{ color: "var(--ink-muted)" }}>
                {e.clinic ? `${data.clinicMeta[e.clinic]?.full ?? e.clinic} (${e.clinic})` : "All clinics"}
              </span>
              {e.note && <span style={{ color: "var(--ink-faint)" }}>{e.note}</span>}
              <button className="btn-x" onClick={() => update((dd) => { dd.scheduleOverrides.splice(i, 1) })}>×</button>
            </div>
          )
        })
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
        <Field label="Provider">
          <select style={{ width: 170 }} value={init} onChange={(e) => setInit(e.target.value)}>
            {data.providers.filter((p) => p.init).map((p) => (
              <option key={p.init} value={p.init}>{p.name} ({p.init})</option>
            ))}
          </select>
        </Field>
        <Field label="Date"><input type="date" style={{ width: 140 }} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Type">
          <select style={{ width: 200 }} value={action} onChange={(e) => setAction(e.target.value as OverrideAction)}>
            {OV_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        {needsClinic && (
          <Field label="Clinic">
            <select style={{ width: 150 }} value={clinic} onChange={(e) => setClinic(e.target.value)}>
              <option value="">— Select —</option>
              {data.clinicOrder.map((c) => (
                <option key={c} value={c}>{data.clinicMeta[c]?.full ?? c} ({c})</option>
              ))}
            </select>
          </Field>
        )}
        {action === "late-start" && (
          <Field label="Start Time"><input type="time" style={{ width: 120 }} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        )}
        <Field label="Note">
          <input type="text" placeholder="Surgery, conference…" style={{ width: 190 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={add}>+ Add</button>
      </div>
    </div>
  )
}

function OverrideBadge({ action, time }: { action: OverrideAction; time?: string }) {
  if (action === "cover") {
    return <span style={{ background: "var(--good-soft)", border: "1px solid var(--good)", borderRadius: 3, padding: "1px 6px", fontSize: ".68rem", color: "var(--good)", fontWeight: 600 }}>COVER</span>
  }
  if (action === "late-start") {
    return <span style={{ background: "var(--flag-soft)", border: "1px solid var(--flag)", borderRadius: 3, padding: "1px 6px", fontSize: ".68rem", color: "var(--flag)", fontWeight: 600 }}>🕐 LATE {shortTime(time || "11:00")}</span>
  }
  return <span style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)", borderRadius: 3, padding: "1px 6px", fontSize: ".68rem", color: "var(--danger)", fontWeight: 600 }}>OUT</span>
}

const FREQS: { value: RecurringFreq; label: string }[] = [
  { value: "1st", label: "1st" }, { value: "2nd", label: "2nd" }, { value: "3rd", label: "3rd" },
  { value: "4th", label: "4th" }, { value: "last", label: "Last" }, { value: "every", label: "Every" },
  { value: "every-other", label: "Every Other" },
]
const RR_ACTIONS = [
  { value: "out-all", label: "🚫 Out (all day)" },
  { value: "out-clinic", label: "🚫 Out at clinic" },
  { value: "at-clinic", label: "📍 At specific clinic" },
] as const

function RecurringRules() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const people = usePtoPeople()
  const [person, setPerson] = useState("")
  const [freq, setFreq] = useState<RecurringFreq>("1st")
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [action, setAction] = useState<(typeof RR_ACTIONS)[number]["value"]>("out-all")
  const [clinic, setClinic] = useState("")
  const [startDate, setStartDate] = useState("")
  const [note, setNote] = useState("")

  const needsClinic = action === "out-clinic" || action === "at-clinic"

  const add = () => {
    const who = person || people[0]?.init
    if (!who) { toast("Pick a person.", "warn"); return }
    if (needsClinic && !clinic) { toast("Please select a clinic.", "warn"); return }
    update((dd) => {
      dd.recurringRules.push({
        person: who, freq, dayOfWeek, action, clinic: needsClinic ? clinic : "", startDate, note,
      })
    })
    setNote("")
    toast(`Recurring rule added for ${who}`, "success")
  }

  return (
    <div className="pto-panel" style={{ borderColor: "#c4b5fd", marginTop: 16 }}>
      <h3 style={{ marginBottom: 4 }}>🔁 Recurring Rules</h3>
      <p style={{ fontSize: ".75rem", color: "var(--ink-faint)", marginBottom: 10 }}>
        Repeating schedule exceptions — surgery days, recurring meetings. They apply automatically to every
        calendar and schedule view.
      </p>

      {data.recurringRules.length === 0 ? (
        <div style={{ color: "var(--ink-faint)", fontSize: ".8rem", fontStyle: "italic" }}>No recurring rules yet.</div>
      ) : (
        data.recurringRules.map((r, i) => {
          const name =
            data.providers.find((p) => p.init === r.person)?.name
            ?? data.currentStaff.find((s) => (s.init || s.name) === r.person)?.name
            ?? r.person
          const clinicName = r.clinic ? data.clinicMeta[r.clinic]?.full ?? r.clinic : ""
          const actionStr =
            r.action === "out-all" ? "Out (all day)"
            : r.action === "out-clinic" ? "Out at " + clinicName
            : "At " + clinicName
          return (
            <div className="rr-entry" key={i}>
              <span className="rr-badge">🔁 Recurring</span>
              <strong>{name}</strong>
              <span style={{ color: "var(--ink-muted)" }}>
                {FREQS.find((f) => f.value === r.freq)?.label ?? r.freq} {WEEKDAY_NAMES[r.dayOfWeek] ?? ""}
              </span>
              <span style={{ color: "#6b21a8" }}>{actionStr}</span>
              {r.note && <span style={{ color: "var(--ink-faint)" }}>{r.note}</span>}
              {r.startDate && <span style={{ color: "var(--ink-faint)", fontSize: ".72rem" }}>from {r.startDate}</span>}
              <button className="btn-x" onClick={() => update((dd) => { dd.recurringRules.splice(i, 1) })}>×</button>
            </div>
          )
        })
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
        <Field label="Person">
          <select style={{ width: 180 }} value={person} onChange={(e) => setPerson(e.target.value)}>
            {people.map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}
          </select>
        </Field>
        <Field label="Frequency">
          <select style={{ width: 170 }} value={freq} onChange={(e) => setFreq(e.target.value as RecurringFreq)}>
            {FREQS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </Field>
        <Field label="Day of Week">
          <select style={{ width: 130 }} value={dayOfWeek} onChange={(e) => setDayOfWeek(+e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{WEEKDAY_NAMES[n]}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select style={{ width: 170 }} value={action} onChange={(e) => setAction(e.target.value as any)}>
            {RR_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        {needsClinic && (
          <Field label="Clinic">
            <select style={{ width: 150 }} value={clinic} onChange={(e) => setClinic(e.target.value)}>
              <option value="">— Select —</option>
              {data.clinicOrder.map((c) => (
                <option key={c} value={c}>{data.clinicMeta[c]?.full ?? c} ({c})</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Start Date"><input type="date" style={{ width: 140 }} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Note">
          <input type="text" placeholder="Surgery, admin day…" style={{ width: 180 }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={add}>+ Add Rule</button>
      </div>
    </div>
  )
}

function PtoCalendar() {
  const { data } = useScheduling()
  const today = useMemo(() => clinicToday(), [])
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())

  const prev = () => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1) }

  const people = [
    ...data.providers.map((p) => ({ name: p.name, init: p.init, type: "prov" as const })),
    ...data.currentStaff.map((s) => ({ name: s.name, init: s.init || s.name, type: "staff" as const })),
  ]

  const startDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: React.ReactNode[] = []
  for (let i = 0; i < startDow; i++) cells.push(<td key={"lead" + i} className="other-month" />)

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = (startDow + day - 1) % 7
    const date = new Date(year, month, day)
    const isToday = date.getTime() === today.getTime()
    const dateStr = ymd(date)
    const chips: React.ReactNode[] = []

    for (const p of people) {
      if (isOnPTO(p.init, date, data.ptoEntries, data.recurringRules)) {
        chips.push(<span key={"p" + p.init} className={"pto-chip " + (p.type === "prov" ? "prov" : "staff")} title={p.name}>{p.init}</span>)
      }
    }
    for (const ov of data.scheduleOverrides) {
      if (ov.date !== dateStr) continue
      if (ov.action !== "out-all" && ov.action !== "out-clinic") continue
      if (isOnPTO(ov.init, date, data.ptoEntries, data.recurringRules)) continue
      const name = people.find((p) => p.init === ov.init)?.name ?? ov.init
      chips.push(<span key={"o" + ov.init + ov.clinic} className="pto-chip override" title={`${name} — ${ov.note || "Out"}`}>{ov.init}</span>)
    }

    cells.push(
      <td key={day} className={[dow === 0 || dow === 6 ? "weekend" : "", isToday ? "today" : ""].filter(Boolean).join(" ")}>
        <div className="cal-day-num">
          {isToday ? (
            <div style={{ background: "var(--accent)", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".72rem" }}>
              {day}
            </div>
          ) : day}
        </div>
        {chips}
      </td>
    )
  }
  const endDow = (startDow + daysInMonth - 1) % 7
  for (let i = endDow + 1; i < 7; i++) cells.push(<td key={"trail" + i} className="other-month" />)

  const rows: React.ReactNode[] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(<tr key={i}>{cells.slice(i, i + 7)}</tr>)

  return (
    <div className="pto-panel" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 10 }}>📅 PTO Calendar</h3>
      <div className="pto-cal-nav">
        <button onClick={prev}>← Prev</button>
        <span className="month-label">{MONTH_NAMES[month]} {year}</span>
        <button onClick={next}>Next →</button>
        <span style={{ marginLeft: "auto", fontSize: ".72rem", color: "var(--ink-faint)" }}>
          <span className="pto-chip prov" style={{ fontSize: ".65rem" }}>BR</span> Provider
          <span className="pto-chip staff" style={{ fontSize: ".65rem", marginLeft: 4 }}>MH</span> Staff
          <span className="pto-chip override" style={{ fontSize: ".65rem", marginLeft: 4 }}>OV</span> Override
        </span>
      </div>
      <table className="pto-cal-grid">
        <thead><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => <th key={x}>{x}</th>)}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="sm-label">{label}</label>
      {children}
    </div>
  )
}
