"use client"

import { Fragment, useState } from "react"
import { useScheduling } from "../store"
import { staffBadgeClass } from "../shared"
import PrefTiles from "./pref-tiles"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { usePlannerToast } from "../toast"
import { BASE_ROLES, DAY_LABELS, WEEKDAYS } from "@/lib/scheduling/constants"
import { chipTextColor, defaultColor, providerActive } from "@/lib/scheduling/providers"
import { AVAIL_CYCLE, AVAIL_ICON, isXrtRole } from "@/lib/scheduling/staffing"
import { clinicToday, d, fmtShort, monday } from "@/lib/scheduling/dates"
import type { AvailState, DayName } from "@/lib/scheduling/types"

// Roster → Roster (the dashboard's renderUnifiedRoster).
//
// Providers and staff in one table, because the question people actually ask is
// "who is around on Tuesday", not "which of our two rosters is this person on".
//
// A provider's day availability is *derived*: they are available on a day if the
// A/B schedule puts them anywhere that day, so it is shown read-only. Only staff
// availability is clickable.

type Filter = "all" | "provider" | "xrt" | "ma" | "fd"

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "provider", label: "Providers" },
  { key: "xrt", label: "Rad Team" },
  { key: "ma", label: "MA" },
  { key: "fd", label: "FD" },
]

interface Row {
  type: "provider" | "staff"
  srcIdx: number
  name: string
  init: string
  color: string
  role: string
  fte: number
  dayAvail: Partial<Record<DayName, AvailState>>
  clinicPref: string
  active: boolean
  startDate: string
}

export default function RosterTable() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const [filter, setFilter] = useState<Filter>("all")
  const [openEdit, setOpenEdit] = useState<Record<string, boolean>>({})
  const now = clinicToday()
  const thisMonday = monday(now)

  const rows: Row[] = []

  data.providers.forEach((p, i) => {
    const dayAvail: Partial<Record<DayName, AvailState>> = {}
    for (const day of WEEKDAYS) {
      const anywhere = data.clinicOrder.some(
        (c) => data.scheduleA[c]?.[day]?.includes(p.init) || data.scheduleB[c]?.[day]?.includes(p.init)
      )
      dayAvail[day] = anywhere ? "available" : "unavailable"
    }
    const key = p.init || p.name
    const prefs = data.iaPreferences[key] || []
    const clinicPref = prefs.length
      ? prefs.slice(0, 3).join(", ")
      : p.mainRegion ? p.mainRegion + (p.secondRegion ? ", " + p.secondRegion : "") : ""
    rows.push({
      type: "provider", srcIdx: i, name: p.name, init: p.init,
      color: p.color || defaultColor(i),
      role: "Provider" + (p.freq === "eow" ? " (EOW)" : ""),
      fte: p.clinicDays ? +(p.clinicDays / 5).toFixed(1) : 1.0,
      dayAvail, clinicPref, active: providerActive(p, thisMonday), startDate: p.start || "",
    })
  })

  data.currentStaff.forEach((s, i) => {
    const ld = d(s.lastDay)
    const key = s.init || s.name
    const isXrt = isXrtRole(s.role)
    const prefs = (isXrt ? data.xrtPreferences[key] : data.iaPreferences[key]) || []
    let clinicPref = prefs.slice(0, 3).join(", ")
    if (!clinicPref && data.staffRegions[key]) clinicPref = data.staffRegions[key]
    rows.push({
      type: "staff", srcIdx: i, name: s.name, init: s.init || "", color: "",
      role: s.role, fte: s.fte ?? 1.0,
      dayAvail: (s.dayAvail as Partial<Record<DayName, AvailState>>) || {},
      clinicPref, active: !ld || ld >= now, startDate: s.startDate || "",
    })
  })

  const filtered = rows.filter((r) => {
    if (filter === "all") return true
    if (filter === "provider") return r.type === "provider"
    if (r.type === "provider") return false
    if (filter === "xrt") return isXrtRole(r.role)
    if (filter === "fd") return r.role === "Front Desk"
    return !isXrtRole(r.role) && r.role !== "Front Desk"
  })

  const cycleAvail = (idx: number, day: DayName) =>
    update((dd) => {
      const s = dd.currentStaff[idx]
      if (!s.dayAvail) s.dayAvail = {}
      const cur = (s.dayAvail[day] || "available") as AvailState
      s.dayAvail[day] = AVAIL_CYCLE[(AVAIL_CYCLE.indexOf(cur) + 1) % AVAIL_CYCLE.length]
    })

  const addProvider = () =>
    update((dd) => {
      dd.providers.push({
        name: "", init: "", ptsDay: 30, clinicDays: 4, freq: "every",
        color: defaultColor(dd.providers.length), location: "", start: "",
      })
    })

  const addStaff = () =>
    update((dd) => {
      dd.currentStaff.push({
        name: "", init: "", role: "Intern 2026", fte: 1.0, startDate: "", lastDay: "",
        dayAvail: Object.fromEntries(WEEKDAYS.map((x) => [x, "available"])) as any,
      })
    })

  const removeRow = async (r: Row) => {
    if (!(await confirmDialog(`Remove ${r.name || "this person"} from the roster?`))) return
    update((dd) => {
      if (r.type === "provider") dd.providers.splice(r.srcIdx, 1)
      else dd.currentStaff.splice(r.srcIdx, 1)
    })
    toast(`${r.name || "Person"} removed from the roster`, "success")
  }

  return (
    <div>
      <div className="staff-roster-header">
        <span className="staff-count">{filtered.length} {filtered.length === 1 ? "person" : "people"}</span>
        <div className="staff-filters">
          {FILTERS.map((f) => (
            <span
              key={f.key}
              className={"staff-filter-btn" + (filter === f.key ? " active" : "")}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-add" onClick={addProvider}>+ Provider</button>
          <button className="btn-add" onClick={addStaff}>+ Staff</button>
        </div>
      </div>

      <div className="callout" style={{ marginBottom: 12 }}>
        <strong>Availability per day</strong> — click to cycle:{" "}
        <span className="day-avail-btn available" style={inlineKey}>✓</span> available ·{" "}
        <span className="day-avail-btn lastresort" style={inlineKey}>△</span> last resort ·{" "}
        <span className="day-avail-btn unavailable" style={inlineKey}>✕</span> unavailable.
        A provider&apos;s days come from the A/B schedule, so they read-only here.
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="staff-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th style={{ textAlign: "center", width: 40 }}>FTE</th>
              <th style={{ textAlign: "center", width: 80 }}>Start</th>
              <th colSpan={5} style={{ textAlign: "center" }}>Availability</th>
              <th>Clinic Pref</th>
              <th>Init</th>
              <th>Color</th>
              <th style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const editKey = `${r.type}-${r.srcIdx}`
              const fteColor = r.fte < 0.5 ? "var(--danger)" : r.fte < 1 ? "var(--flag)" : "var(--ink)"
              const fg = r.color ? chipTextColor(r.color) : "#fff"

              return (
                <Fragment key={editKey}>
                  <tr style={{ opacity: r.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600, fontSize: ".84rem" }}>
                      {r.name || <span style={{ color: "var(--ink-faint)" }}>New</span>}
                    </td>
                    <td><span className={"staff-role-badge " + (r.type === "provider" ? "provider" : staffBadgeClass(r.role))}>{r.role}</span></td>
                    <td style={{ textAlign: "center", fontSize: ".8rem", fontWeight: 600, color: fteColor }}>
                      {r.fte === 1 ? "1.0" : Number(r.fte).toFixed(1)}
                    </td>
                    <td style={{ textAlign: "center", fontSize: ".73rem", color: "var(--ink-muted)" }}>
                      {r.startDate ? fmtShort(d(r.startDate)!) : ""}
                    </td>
                    {WEEKDAYS.map((day, di) => {
                      const state = (r.dayAvail[day] || "available") as AvailState
                      const readOnly = r.type === "provider"
                      return (
                        <td key={day} style={{ textAlign: "center", padding: "6px 2px" }}>
                          <div
                            className={"day-avail-btn " + state}
                            title={`${DAY_LABELS[di]}: ${state}${readOnly ? " (from the A/B schedule)" : ""}`}
                            style={readOnly ? { cursor: "default" } : undefined}
                            onClick={readOnly ? undefined : () => cycleAvail(r.srcIdx, day)}
                          >
                            {AVAIL_ICON[state]}
                          </div>
                          <div style={{ fontSize: ".6rem", color: "var(--ink-faint)", marginTop: 2 }}>{DAY_LABELS[di]}</div>
                        </td>
                      )
                    })}
                    <td
                      style={{ fontSize: ".73rem", color: "var(--ink-muted)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={r.clinicPref}
                    >
                      {r.clinicPref || "—"}
                    </td>
                    <td>
                      {r.init
                        ? r.type === "provider"
                          ? <span className="provider-chip row-chip" style={{ background: r.color, borderColor: r.color, color: fg, fontSize: ".7rem" }}>{r.init}</span>
                          : r.init
                        : ""}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {r.type === "provider" ? (
                        <input
                          type="color"
                          className="color-swatch"
                          value={r.color}
                          onChange={(e) => update((dd) => { dd.providers[r.srcIdx].color = e.target.value })}
                        />
                      ) : (
                        <span style={{ color: "var(--ink-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="staff-action-btn"
                        title="Edit"
                        onClick={() => setOpenEdit((o) => ({ ...o, [editKey]: !o[editKey] }))}
                      >
                        ✎
                      </button>
                      <button className="staff-action-btn delete" title="Remove" onClick={() => void removeRow(r)}>🗑</button>
                    </td>
                  </tr>
                  <tr className={"staff-edit-row" + (openEdit[editKey] ? " open" : "")}>
                    <td colSpan={14} style={{ padding: "12px 8px", background: "var(--surface-sunken)" }}>
                      {openEdit[editKey] && <EditForm row={r} />}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const inlineKey: React.CSSProperties = {
  width: "auto", height: "auto", display: "inline", padding: "1px 5px", fontSize: ".72rem",
}

function EditForm({ row }: { row: Row }) {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const regionNames = Object.keys(data.clinicRegions)

  if (row.type === "provider") {
    const p = data.providers[row.srcIdx]
    if (!p) return null
    const key = p.init || p.name
    const availClinics = data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery)
    const setP = (k: string, v: any) => update((dd) => { (dd.providers[row.srcIdx] as any)[k] = v })

    return (
      <>
        <div className="staff-edit-grid">
          <Field label="Name"><input type="text" value={p.name} style={{ width: 150 }} onChange={(e) => setP("name", e.target.value)} /></Field>
          <Field label="Initials"><input type="text" value={p.init} style={{ width: 50, textAlign: "center" }} onChange={(e) => setP("init", e.target.value)} /></Field>
          <Field label="Clinic Days/Wk"><input type="number" min={0} max={6} value={p.clinicDays} style={{ width: 55 }} onChange={(e) => setP("clinicDays", +e.target.value)} /></Field>
          <Field label="Pts/Day"><input type="number" min={0} max={80} value={p.ptsDay} style={{ width: 55 }} onChange={(e) => setP("ptsDay", +e.target.value)} /></Field>
          <Field label="Freq">
            <select value={p.freq} onChange={(e) => setP("freq", e.target.value)}>
              <option value="every">Every Week</option>
              <option value="eow">Every Other Week</option>
            </select>
          </Field>
          <Field label="Start Date"><input type="date" value={p.start || ""} onChange={(e) => setP("start", e.target.value)} /></Field>
          <Field label="Location"><input type="text" value={p.location || ""} placeholder="City / area…" style={{ width: 150 }} onChange={(e) => setP("location", e.target.value)} /></Field>
          <Field label="Primary Region">
            <select value={p.mainRegion || ""} onChange={(e) => setP("mainRegion", e.target.value)}>
              <option value="">—</option>
              {regionNames.map((rn) => <option key={rn} value={rn}>{rn}</option>)}
            </select>
          </Field>
          <Field label="Secondary Region">
            <select value={p.secondRegion || ""} onChange={(e) => setP("secondRegion", e.target.value)}>
              <option value="">—</option>
              {regionNames.map((rn) => <option key={rn} value={rn}>{rn}</option>)}
            </select>
          </Field>
        </div>
        <PrefTiles storeKey={key} isXrt={false} availClinics={availClinics} />
      </>
    )
  }

  const s = data.currentStaff[row.srcIdx]
  if (!s) return null
  const key = s.init || s.name
  const isXrt = isXrtRole(s.role)
  const allRoles = Array.from(new Set([...BASE_ROLES, ...data.customRoles, ...(s.role ? [s.role] : [])]))
  const availClinics = isXrt
    ? data.clinicOrder.filter((c) => data.clinicMeta[c]?.xrNeed && !data.clinicMeta[c]?.isSurgery)
    : data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery)
  const setS = (k: string, v: any) => update((dd) => { (dd.currentStaff[row.srcIdx] as any)[k] = v })

  const onRoleChange = (value: string) => {
    if (value !== "__add_new__") { setS("role", value); return }
    const name = window.prompt("Enter new role name (e.g. Intern 2027):")?.trim()
    if (!name) return
    update((dd) => {
      if (!BASE_ROLES.includes(name) && !dd.customRoles.includes(name)) dd.customRoles.push(name)
      dd.currentStaff[row.srcIdx].role = name
    })
    toast(`Added the role "${name}"`, "success")
  }

  return (
    <>
      <div className="staff-edit-grid">
        <Field label="Name"><input type="text" value={s.name} style={{ width: 150 }} onChange={(e) => setS("name", e.target.value)} /></Field>
        <Field label="Initials"><input type="text" value={s.init || ""} style={{ width: 50, textAlign: "center" }} onChange={(e) => setS("init", e.target.value)} /></Field>
        <Field label="Role">
          <select value={s.role} onChange={(e) => onRoleChange(e.target.value)}>
            {allRoles.map((ro) => <option key={ro} value={ro}>{ro}</option>)}
            <option value="__add_new__">+ Add new role…</option>
          </select>
        </Field>
        <Field label="FTE"><input type="number" min={0} max={1} step={0.1} value={s.fte ?? 1.0} style={{ width: 55 }} onChange={(e) => setS("fte", +e.target.value)} /></Field>
        <Field label="Start Date"><input type="date" value={s.startDate || ""} onChange={(e) => setS("startDate", e.target.value)} /></Field>
        <Field label="Last Day"><input type="date" value={s.lastDay || ""} onChange={(e) => setS("lastDay", e.target.value)} /></Field>
        <Field label="Region">
          <select
            value={data.staffRegions[key] || ""}
            onChange={(e) => update((dd) => {
              if (e.target.value) dd.staffRegions[key] = e.target.value
              else delete dd.staffRegions[key]
            })}
          >
            <option value="">—</option>
            {regionNames.map((rn) => <option key={rn} value={rn}>{rn}</option>)}
          </select>
        </Field>
        <Field label="Notes"><input type="text" value={s.notes || ""} placeholder="Notes…" style={{ width: 180 }} onChange={(e) => setS("notes", e.target.value)} /></Field>
      </div>
      <PrefTiles storeKey={key} isXrt={isXrt} availClinics={availClinics} />
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="staff-edit-field">
      <label>{label}</label>
      {children}
    </div>
  )
}
