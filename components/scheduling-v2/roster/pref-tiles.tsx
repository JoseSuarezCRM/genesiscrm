"use client"

import { useEffect, useRef, useState } from "react"
import { useScheduling } from "../store"

// Clinic preference tiles (the dashboard's buildPrefTiles + prefDrag*).
//
// Rank order is the whole point — the assignment engines score a clinic by its
// index in this list — so the tiles are dragged into order rather than picked
// from a numbered dropdown.
//
// This is the only place preferences are edited in v10; the old Intern and XRT
// preference screens are gone.

export default function PrefTiles({
  storeKey, isXrt, availClinics,
}: {
  storeKey: string
  isXrt: boolean
  availClinics: string[]
}) {
  const { data, update } = useScheduling()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [toAdd, setToAdd] = useState("")
  const seeded = useRef(false)

  const store = isXrt ? data.xrtPreferences : data.iaPreferences
  const prefs = (store[storeKey] || []).filter((c) => availClinics.includes(c))

  // A person with no list yet prefers every clinic equally — seed the full set so
  // the tiles are draggable immediately instead of showing an empty zone.
  useEffect(() => {
    if (seeded.current) return
    if (store[storeKey]) return
    seeded.current = true
    update((dd) => {
      const s = isXrt ? dd.xrtPreferences : dd.iaPreferences
      if (!s[storeKey]) s[storeKey] = [...availClinics]
    })
  }, [storeKey, isXrt, availClinics, store, update])

  const setList = (next: string[]) =>
    update((dd) => {
      const s = isXrt ? dd.xrtPreferences : dd.iaPreferences
      s[storeKey] = next
    })

  const onDrop = (target: string | null) => {
    setOver(null)
    if (!dragging) return
    const from = prefs.indexOf(dragging)
    setDragging(null)
    if (from < 0) return
    const next = [...prefs]
    next.splice(from, 1)
    if (target) {
      const to = prefs.indexOf(target)
      if (to < 0) return
      next.splice(to, 0, dragging)
    } else {
      next.push(dragging)
    }
    setList(next)
  }

  const unused = availClinics.filter((c) => !prefs.includes(c))

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <label className="sm-label">
        Clinic Preferences{" "}
        <span style={{ fontWeight: 400, textTransform: "none", fontSize: 11, color: "var(--ink-faint)" }}>
          (drag to reorder)
        </span>
      </label>
      <div
        className="pref-tile-zone"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
        onDrop={(e) => { e.preventDefault(); onDrop(null) }}
      >
        {prefs.length === 0 ? (
          <span style={{ color: "var(--ink-faint)", fontSize: 12, padding: 6 }}>
            No preferences — add clinics below
          </span>
        ) : (
          prefs.map((c, ci) => (
            <div
              key={c}
              className={"pref-tile" + (over === c ? " drag-over" : "")}
              draggable
              style={dragging === c ? { opacity: 0.4 } : undefined}
              onDragStart={(e) => { setDragging(c); e.dataTransfer.effectAllowed = "move" }}
              onDragEnd={() => { setDragging(null); setOver(null) }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(c) }}
              onDragLeave={() => setOver((o) => (o === c ? null : o))}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(c) }}
            >
              <span className="pref-tile-rank">{ci + 1}</span>
              <span className="pref-tile-name">{c}</span>
              <span
                className="pref-tile-x"
                onClick={() => setList(prefs.filter((x) => x !== c))}
              >
                ×
              </span>
            </div>
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        <select
          value={toAdd}
          onChange={(e) => setToAdd(e.target.value)}
          style={{ fontSize: 13, padding: "5px 8px", minWidth: 200 }}
        >
          <option value="">+ Add clinic…</option>
          {unused.map((c) => (
            <option key={c} value={c}>{c} — {data.clinicMeta[c]?.full ?? c}</option>
          ))}
        </select>
        <button
          className="btn-add"
          style={{ margin: 0, padding: "4px 12px", fontSize: 12 }}
          onClick={() => { if (toAdd) { setList([...prefs, toAdd]); setToAdd("") } }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
