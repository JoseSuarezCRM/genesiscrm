"use client"

import { useScheduling } from "../store"
import TaskPicker from "./task-picker"
import { WEEKDAYS } from "@/lib/scheduling/constants"
import { emptyTask, taskGetAssignees } from "@/lib/scheduling/tasks"

// Schedule Builder → Task Assignments (renderTaskTable).

export default function TaskAssignments() {
  const { data, update } = useScheduling()

  // Most tasks are staffed the same way every day, so Monday is the template.
  const applyAll = (i: number) =>
    update((dd) => {
      const mon = taskGetAssignees((dd.dailyTasks[i] as any).MON)
      for (const day of ["TUE", "WED", "THU", "FRI"] as const) {
        (dd.dailyTasks[i] as any)[day] = [...mon]
      }
    })

  return (
    <div>
      <h2>Weekly Task Assignments</h2>
      <div className="callout">
        Assign recurring tasks per day of the week. Each cell can have different staff for different days.
        Tasks repeat weekly and appear in the <strong>Full Schedule</strong> grid, where they can also be
        edited. Use <strong>Apply All</strong> to copy Monday&apos;s value across the week.
      </div>

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="task-table" style={{ maxWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Task</th>
              {WEEKDAYS.map((d) => <th key={d}>{d}</th>)}
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {data.dailyTasks.map((t, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text" value={t.name} placeholder="Task name"
                    onChange={(e) => update((dd) => { dd.dailyTasks[i].name = e.target.value })}
                  />
                </td>
                {WEEKDAYS.map((day) => (
                  <td key={day}><TaskPicker taskIdx={i} day={day} /></td>
                ))}
                <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                  <button
                    className="btn-add" style={{ margin: 0, fontSize: ".65rem", padding: "2px 6px" }}
                    title="Copy Monday to all days" onClick={() => applyAll(i)}
                  >
                    Apply All
                  </button>
                  <button
                    className="btn-x" title="Remove"
                    onClick={() => update((dd) => { dd.dailyTasks.splice(i, 1) })}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        className="btn-add" style={{ marginTop: 10 }}
        onClick={() => update((dd) => { dd.dailyTasks.push(emptyTask()) })}
      >
        + Add Task
      </button>
    </div>
  )
}
