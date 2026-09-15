"use client"

import { useScheduling } from "../store"
import { usePlannerToast } from "../toast"
import { confirmDialog } from "@/components/ui/confirm-dialog"

// Schedule Builder → Surgery Shadowing (surgRenderLog2).
//
// v10 keeps only the running log — the weekly assignment grid that used to write
// into it was removed from the dashboard — so this is a historical record: read,
// and delete a wrong row.

export default function SurgeryLog() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()

  const sorted = [...data.surgLog]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date))

  const remove = async (idx: number) => {
    const entry = data.surgLog[idx]
    if (!entry) return
    if (!(await confirmDialog(
      `Delete the shadowing entry for ${entry.internName || entry.intern} on ${entry.date}?`
    ))) return
    update((dd) => { dd.surgLog.splice(idx, 1) })
    toast("Shadowing entry deleted", "success")
  }

  return (
    <div>
      <div className="callout">
        Track surgery shadowing assignments for MAs and interns. Monitor who needs more surgical exposure.
      </div>

      <h2>Shadowing Log</h2>
      <p className="desc-text">All saved shadowing assignments across weeks. Use this as a running record.</p>

      {sorted.length === 0 ? (
        <p className="empty-state">No shadowing entries yet.</p>
      ) : (
        <>
          <table className="surg-log-table">
            <thead>
              <tr><th>Date</th><th>Location</th><th>Intern</th><th>Surgeon/Provider</th><th /></tr>
            </thead>
            <tbody>
              {sorted.map(({ e, i }) => (
                <tr key={i}>
                  <td>{e.date}</td>
                  <td>{e.locationName || e.location}</td>
                  <td><strong>{e.internName || e.intern}</strong></td>
                  <td>{e.provider || "—"}</td>
                  <td><button className="btn-x" onClick={() => void remove(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: ".75rem", color: "var(--ink-faint)" }}>
            {data.surgLog.length} total {data.surgLog.length === 1 ? "entry" : "entries"}
          </div>
        </>
      )}
    </div>
  )
}
