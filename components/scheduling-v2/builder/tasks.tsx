"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { taskAssignees, getAllTaskPeople } from "@/lib/scheduling/tasks"

const WDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const

export default function TaskAssignments() {
  const { data, update } = useScheduling()
  const [openCell, setOpenCell] = useState<string | null>(null)

  const setDay = (i: number, day: string, arr: string[]) =>
    update((dd) => { (dd.dailyTasks[i] as any)[day] = arr })

  const toggle = (i: number, day: string, init: string) => {
    const arr = taskAssignees((data.dailyTasks[i] as any)[day])
    const idx = arr.indexOf(init)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(init)
    setDay(i, day, [...arr])
  }

  return (
    <div>
      <h2>Weekly Task Assignments</h2>
      <div className="callout">Assign recurring tasks per weekday. Tasks repeat weekly and appear in the <strong>Master Schedule</strong>. Use <strong>Apply All</strong> to copy Monday across the week.</div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="task-table" style={{ maxWidth: "100%" }}>
          <thead><tr><th style={{ width: 140 }}>Task</th>{WDAYS.map((d) => <th key={d}>{d}</th>)}<th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {data.dailyTasks.map((t, i) => (
              <tr key={i}>
                <td><input type="text" value={t.name} onChange={(e) => update((dd) => { dd.dailyTasks[i].name = e.target.value })} placeholder="Task name" /></td>
                {WDAYS.map((day) => {
                  const assigned = taskAssignees((t as any)[day])
                  const cellId = i + "-" + day
                  const people = getAllTaskPeople(t.name || "", data)
                  return (
                    <td key={day}>
                      <div className="task-multi-wrap">
                        <div className="task-chips" onClick={() => setOpenCell(openCell === cellId ? null : cellId)}>
                          {assigned.length ? assigned.map((a, k) => (
                            <span key={k} className="task-chip">{a}<span className="tc-x" onClick={(e) => { e.stopPropagation(); setDay(i, day, assigned.filter((x) => x !== a)) }}>×</span></span>
                          )) : <span style={{ color: "#ccc", fontSize: ".72rem", padding: 2 }}>+ click →</span>}
                        </div>
                        {openCell === cellId && (
                          <div className="task-dropdown open">
                            <div style={{ padding: 4, borderBottom: "1px solid #eee" }}>
                              <input type="text" placeholder="Type to add..." style={{ width: "100%", fontSize: ".72rem", padding: "3px 5px", border: "1px solid #ddd", borderRadius: 3, boxSizing: "border-box" }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); const v = (e.target as HTMLInputElement).value.trim(); if (v && !assigned.includes(v)) setDay(i, day, [...assigned, v]); (e.target as HTMLInputElement).value = "" } }}
                                onClick={(e) => e.stopPropagation()} />
                            </div>
                            {people.map((p) => {
                              const sel = assigned.includes(p.init)
                              const style = p.isGroup ? { color: "#2563eb", fontWeight: 600 } : p.isClinic ? { color: "#059669", fontWeight: 600 } : undefined
                              return (
                                <div key={p.init} className={"task-dd-item" + (sel ? " selected" : "")} style={style} onClick={(e) => { e.stopPropagation(); toggle(i, day, p.init) }}>
                                  <span className="dd-check">{sel ? "✓" : ""}</span> {p.init} <span style={{ color: "#888", fontSize: ".65rem" }}>{p.name}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                  <button className="btn-add" style={{ margin: 0, fontSize: ".65rem", padding: "2px 6px" }} onClick={() => { const mon = taskAssignees((t as any).MON); update((dd) => { (["TUE", "WED", "THU", "FRI"] as const).forEach((day) => { (dd.dailyTasks[i] as any)[day] = [...mon] }) }) }} title="Copy Monday to all days">Apply All</button>
                  <button className="btn-x" onClick={() => update((dd) => { dd.dailyTasks.splice(i, 1) })} title="Remove">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-add" onClick={() => update((dd) => { dd.dailyTasks.push({ name: "", MON: [], TUE: [], WED: [], THU: [], FRI: [] }) })} style={{ marginTop: 10 }}>+ Add Task</button>
    </div>
  )
}
