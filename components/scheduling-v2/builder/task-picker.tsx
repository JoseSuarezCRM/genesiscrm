"use client"

import { useEffect, useRef, useState } from "react"
import { useScheduling } from "../store"
import { getAllTaskPeople, taskGetAssignees } from "@/lib/scheduling/tasks"
import type { DayName } from "@/lib/scheduling/types"

// The multi-select assignee cell used by Schedule Builder → Task Assignments and,
// in v10, inside the Full Schedule grid as well — so it lives on its own and both
// render the same control rather than two that drift.
//
// Free text is deliberately allowed: rows like "Call Center" or a covering agency
// aren't people on the roster, and the prototype lets you type them in.

export default function TaskPicker({ taskIdx, day }: { taskIdx: number; day: DayName }) {
  const { data, update } = useScheduling()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const wrapRef = useRef<HTMLDivElement>(null)

  const task = data.dailyTasks[taskIdx]
  const assigned = taskGetAssignees((task as any)?.[day])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  const setAssignees = (next: string[]) =>
    update((dd) => { (dd.dailyTasks[taskIdx] as any)[day] = next })

  const toggle = (init: string) =>
    setAssignees(assigned.includes(init) ? assigned.filter((a) => a !== init) : [...assigned, init])

  const addTyped = () => {
    const v = typed.trim()
    if (!v) return
    if (!assigned.includes(v)) setAssignees([...assigned, v])
    setTyped("")
  }

  const people = open
    ? getAllTaskPeople(task?.name ?? "", data.providers, data.currentStaff, data.clinicOrder, data.clinicMeta)
    : []

  return (
    <div className="task-multi-wrap" ref={wrapRef}>
      <div className="task-chips" onClick={() => setOpen((o) => !o)}>
        {assigned.length ? (
          assigned.map((a) => (
            <span className="task-chip" key={a}>
              {a}
              <span
                className="tc-x"
                onClick={(e) => { e.stopPropagation(); setAssignees(assigned.filter((x) => x !== a)) }}
              >
                ×
              </span>
            </span>
          ))
        ) : (
          <span style={{ color: "var(--ink-faint)", fontSize: ".72rem", padding: 2 }}>— click —</span>
        )}
      </div>

      {open && (
        <div className="task-dropdown open">
          <div style={{ padding: 4, borderBottom: "1px solid var(--border)" }}>
            <input
              type="text"
              className="task-type-in"
              placeholder="Type to add…"
              value={typed}
              autoFocus
              style={{ width: "100%", fontSize: ".72rem", padding: "3px 5px" }}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addTyped() } }}
            />
          </div>
          {people.map((p) => {
            const sel = assigned.includes(p.init)
            return (
              <div
                key={p.init}
                className={"task-dd-item" + (sel ? " selected" : "")}
                style={p.isGroup ? { color: "var(--blue)", fontWeight: 600 }
                  : p.isClinic ? { color: "var(--good)", fontWeight: 600 } : undefined}
                onClick={(e) => { e.stopPropagation(); toggle(p.init) }}
              >
                <span className="dd-check">{sel ? "✓" : ""}</span> {p.init}{" "}
                <span style={{ color: "var(--ink-faint)", fontSize: ".65rem" }}>{p.name}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
