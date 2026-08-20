"use client"

import { Fragment, useMemo, useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { SubTabs, staffBadgeClass } from "@/components/scheduling-v2/shared"
import { chipTextColor, defaultColor, getProviderClinicsFromSchedule } from "@/lib/scheduling/providers"
import { availOpts, availLabel, staffRoleGroup, migrateStaffDayAvail } from "@/lib/scheduling/staffing"
import { ALL_STAFF_ROLES, DAYS } from "@/lib/scheduling/constants"
import { d } from "@/lib/scheduling/dates"
import type { AvailState, DayName } from "@/lib/scheduling/types"

const AVAIL_CYCLE: AvailState[] = ["available", "lastresort", "unavailable"]
const AVAIL_ICON: Record<AvailState, string> = { available: "✓", lastresort: "△", unavailable: "✕" }

export default function RosterPage() {
  const [tab, setTab] = useState("providers")
  return (
    <div className="section">
      <SubTabs
        tabs={[
          { key: "providers", label: "Providers" },
          { key: "current", label: "Current Staff" },
          { key: "incoming", label: "Incoming Staff" },
          { key: "clinicmgmt", label: "Manage Clinics" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "providers" && <Providers />}
      {tab === "current" && <CurrentStaff />}
      {tab === "incoming" && <Incoming />}
      {tab === "clinicmgmt" && <ManageClinics />}
    </div>
  )
}

function Providers() {
  const { data, update } = useScheduling()
  const regionNames = Object.keys(data.clinicRegions)
  const now = new Date()

  const setField = (i: number, key: any, val: any) =>
    update((dd) => { (dd.providers[i] as any)[key] = val })

  return (
    <div>
      <div className="callout-blue">
        <strong>Clinic codes:</strong> {data.clinicOrder.join(" · ")}. Alternating rules are handled in the A/B Schedule tab.
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr>
            <th></th><th>Color</th><th>Name</th><th>Init</th><th>Pts/Day</th><th>Days/Wk</th>
            <th>Frequency</th><th>Main Region</th><th>2nd Region</th><th>Leave</th><th>Return</th><th>Start</th><th></th>
          </tr></thead>
          <tbody>
            {data.providers.map((p, i) => {
              const active = (() => { const s = d(p.start); return !(s && s > now) })()
              const col = p.color || defaultColor(i)
              const fg = chipTextColor(col)
              return (
                <tr key={i}>
                  <td><span className={"dot " + (active ? "dot-active" : "dot-future")} /></td>
                  <td style={{ textAlign: "center" }}>
                    <input type="color" className="color-swatch" value={col} onChange={(e) => setField(i, "color", e.target.value)} />
                  </td>
                  <td>
                    <span className="provider-chip" style={{ background: col, borderColor: col, color: fg, fontSize: ".75rem" }}>{p.init || "?"}</span>{" "}
                    <input type="text" value={p.name} onChange={(e) => setField(i, "name", e.target.value)} style={{ width: 110 }} />
                  </td>
                  <td><input type="text" value={p.init} onChange={(e) => setField(i, "init", e.target.value)} style={{ width: 40, textAlign: "center" }} /></td>
                  <td><input type="number" value={p.ptsDay} min={1} onChange={(e) => setField(i, "ptsDay", +e.target.value)} style={{ width: 55 }} />{p.ptsDay > 30 && <span className="badge-high">HIGH</span>}</td>
                  <td><input type="number" value={p.clinicDays} min={0} max={7} onChange={(e) => setField(i, "clinicDays", +e.target.value)} style={{ width: 45 }} /></td>
                  <td>
                    <select value={p.freq} onChange={(e) => setField(i, "freq", e.target.value)}>
                      <option value="every">Every week</option>
                      <option value="eow">Every other week</option>
                    </select>
                  </td>
                  <td>
                    <select value={p.mainRegion || ""} onChange={(e) => setField(i, "mainRegion", e.target.value)} style={{ fontSize: ".78rem" }}>
                      <option value="">—</option><option value="Any">Any</option>
                      {regionNames.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={p.secondRegion || ""} onChange={(e) => setField(i, "secondRegion", e.target.value)} style={{ fontSize: ".78rem" }}>
                      <option value="">—</option><option value="Any">Any</option>
                      {regionNames.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td><input type="date" value={p.leave} onChange={(e) => setField(i, "leave", e.target.value)} /></td>
                  <td><input type="date" value={p.ret} onChange={(e) => setField(i, "ret", e.target.value)} /></td>
                  <td><input type="date" value={p.start} onChange={(e) => setField(i, "start", e.target.value)} /></td>
                  <td><button className="btn-x" onClick={() => update((dd) => { dd.providers.splice(i, 1) })}>✕</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button className="btn-add" onClick={() => update((dd) => { dd.providers.push({ name: "", init: "", ptsDay: 30, clinicDays: 3, freq: "every", clinics: "", leave: "", ret: "", start: "", color: defaultColor(dd.providers.length), mainRegion: "", secondRegion: "" }) })}>+ Add Provider</button>
    </div>
  )
}

function CurrentStaff() {
  const { data, update } = useScheduling()
  const [filter, setFilter] = useState<"all" | "xrt" | "ma" | "fd">("all")
  const [editOpen, setEditOpen] = useState<number | null>(null)

  // Ensure per-day availability exists.
  useMemo(() => { migrateStaffDayAvail(data.currentStaff) }, [data.currentStaff])

  const activeCount = data.currentStaff.filter((s) => { const ld = d(s.lastDay); return !ld || ld >= new Date() }).length
  const dayLabels = ["M", "T", "W", "T", "F", "S"]

  const cycle = (i: number, day: DayName) =>
    update((dd) => {
      const s = dd.currentStaff[i]
      if (!s.dayAvail) s.dayAvail = {}
      const cur = s.dayAvail[day] || "available"
      s.dayAvail[day] = AVAIL_CYCLE[(AVAIL_CYCLE.indexOf(cur) + 1) % 3]
    })

  return (
    <div>
      <div className="staff-roster-header">
        <span className="staff-count">{activeCount} active staff</span>
        <div className="staff-filters">
          {(["all", "xrt", "ma", "fd"] as const).map((f) => (
            <span key={f} className={"staff-filter-btn" + (filter === f ? " active" : "")} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "xrt" ? "XR Tech" : f.toUpperCase()}
            </span>
          ))}
        </div>
        <button className="btn-add" onClick={() => { update((dd) => { dd.currentStaff.push({ name: "", init: "", role: "Intern 2026", lastDay: "", avail: 1.0, notes: "", lastResort: false, dayAvail: { MON: "available", TUE: "available", WED: "available", THU: "available", FRI: "available", SAT: "unavailable" } }) }); setEditOpen(data.currentStaff.length) }}>+ Add Staff</button>
      </div>
      <div className="callout" style={{ marginBottom: 12 }}>
        <strong>Availability per day</strong> — click to cycle: ✓ available · △ last resort · ✕ unavailable
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="staff-table">
          <thead><tr>
            <th>Name</th><th>Role</th><th colSpan={6} style={{ textAlign: "center" }}>Availability</th><th style={{ width: 70 }}></th>
          </tr></thead>
          <tbody>
            {data.currentStaff.map((s, i) => {
              const group = staffRoleGroup(s.role)
              if (filter !== "all" && group !== filter) return null
              const ld = d(s.lastDay)
              const active = !ld || ld >= new Date()
              return (
                <Fragment key={i}>
                  <tr style={{ opacity: active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600, fontSize: ".84rem" }}>{s.name || "New Staff"} {s.init && <span style={{ color: "#999", fontWeight: 400, fontSize: ".75rem" }}>({s.init})</span>}</td>
                    <td><span className={"staff-role-badge " + staffBadgeClass(s.role)}>{s.role}</span></td>
                    {DAYS.map((day, di) => {
                      const state = (s.dayAvail?.[day] || "available") as AvailState
                      return (
                        <td key={day} style={{ textAlign: "center", padding: "6px 2px" }}>
                          <div className={"day-avail-btn " + state} style={{ margin: "0 auto" }} onClick={() => cycle(i, day)} title={`${dayLabels[di]}: ${state}`}>{AVAIL_ICON[state]}</div>
                          <div style={{ fontSize: ".6rem", color: "#aaa", marginTop: 2 }}>{dayLabels[di]}</div>
                        </td>
                      )
                    })}
                    <td>
                      <button className="staff-action-btn" onClick={() => setEditOpen(editOpen === i ? null : i)} title="Edit">✎</button>
                      <button className="staff-action-btn delete" onClick={() => { if (confirm(`Remove ${s.name || "this staff"}?`)) update((dd) => { dd.currentStaff.splice(i, 1) }) }} title="Delete">🗑</button>
                    </td>
                  </tr>
                  {editOpen === i && (
                    <tr>
                      <td colSpan={9} style={{ padding: "12px 8px", background: "#f9fafb" }}>
                        <div className="staff-edit-grid">
                          <div className="staff-edit-field"><label>Name</label><input type="text" value={s.name} onChange={(e) => update((dd) => { dd.currentStaff[i].name = e.target.value })} style={{ width: 150 }} /></div>
                          <div className="staff-edit-field"><label>Initials</label><input type="text" value={s.init || ""} onChange={(e) => update((dd) => { dd.currentStaff[i].init = e.target.value })} style={{ width: 50, textAlign: "center" }} /></div>
                          <div className="staff-edit-field"><label>Role</label>
                            <select value={s.role} onChange={(e) => update((dd) => { dd.currentStaff[i].role = e.target.value })}>
                              {ALL_STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}
                            </select>
                          </div>
                          <div className="staff-edit-field"><label>Region</label>
                            <select value={data.staffRegions[s.init || s.name] || ""} onChange={(e) => update((dd) => { dd.staffRegions[dd.currentStaff[i].init || dd.currentStaff[i].name] = e.target.value })}>
                              <option value="">—</option>
                              {Object.keys(data.clinicRegions).map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <div className="staff-edit-field"><label>Last Day</label><input type="date" value={s.lastDay || ""} onChange={(e) => update((dd) => { dd.currentStaff[i].lastDay = e.target.value })} /></div>
                          <div className="staff-edit-field"><label>Notes</label><input type="text" value={s.notes || ""} onChange={(e) => update((dd) => { dd.currentStaff[i].notes = e.target.value })} placeholder="Notes..." style={{ width: 180 }} /></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Incoming() {
  const { data, update } = useScheduling()
  return (
    <div>
      <h2>Incoming Staff (Interns, Providers, XRTs)</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Name</th><th>Earliest Start</th><th>Availability</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {data.incomingInterns.map((s, i) => (
              <tr key={i}>
                <td><input type="text" value={s.name} onChange={(e) => update((dd) => { dd.incomingInterns[i].name = e.target.value })} style={{ width: 160 }} /></td>
                <td><input type="date" value={s.start} onChange={(e) => update((dd) => { dd.incomingInterns[i].start = e.target.value })} /></td>
                <td>
                  <select value={s.avail} onChange={(e) => update((dd) => { dd.incomingInterns[i].avail = +e.target.value })}>
                    {availOpts().map((a) => <option key={a} value={a}>{availLabel(a)}</option>)}
                  </select>
                </td>
                <td><input type="text" value={s.notes || ""} onChange={(e) => update((dd) => { dd.incomingInterns[i].notes = e.target.value })} placeholder="Notes..." style={{ width: 260 }} /></td>
                <td><button className="btn-x" onClick={() => update((dd) => { dd.incomingInterns.splice(i, 1) })}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-add" onClick={() => update((dd) => { dd.incomingInterns.push({ name: "", start: "", avail: 1.0, notes: "" }) })}>+ Add Incoming Staff</button>
    </div>
  )
}

function ManageClinics() {
  const { data, update } = useScheduling()

  const getAutoCity = () => {
    const assigned = new Set<string>()
    Object.entries(data.clinicRegions).forEach(([name, list]) => { if (name !== "City") list.forEach((c) => assigned.add(c)) })
    return data.clinicOrder.filter((c) => !assigned.has(c) && !data.clinicMeta[c]?.isSurgery)
  }

  const toggleClinicRegion = (regionName: string, code: string) =>
    update((dd) => {
      const list = dd.clinicRegions[regionName] || []
      const idx = list.indexOf(code)
      if (idx >= 0) list.splice(idx, 1)
      else {
        Object.keys(dd.clinicRegions).forEach((r) => {
          if (r === "City" || r === regionName) return
          const ri = dd.clinicRegions[r].indexOf(code)
          if (ri >= 0) dd.clinicRegions[r].splice(ri, 1)
        })
        list.push(code)
      }
      dd.clinicRegions[regionName] = list
    })

  return (
    <div>
      <h2>Manage Clinics</h2>
      <p className="desc-text-lg">Add, remove, or update clinic names and abbreviations. Changes propagate everywhere.</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".4px", color: "#777", padding: "0 10px" }}>
        <span style={{ width: 55 }}>Code</span><span style={{ flex: 1, minWidth: 120 }}>Full Name</span><span style={{ width: 90 }}>Contract</span><span style={{ width: 45 }}>Days</span><span style={{ width: 50, textAlign: "center" }}>XR</span><span style={{ width: 30 }}></span>
      </div>
      <div className="surg-locations">
        {data.clinicOrder.map((code, i) => {
          const meta = data.clinicMeta[code] || { full: "", contract: "", daysOpen: 0, xrNeed: false }
          return (
            <div className="clinic-mgmt-row" key={code}>
              <input className="cm-code" value={code} onChange={(e) => renameClinicCode(update, data, i, e.target.value)} />
              <input className="cm-name" value={meta.full} onChange={(e) => update((dd) => { dd.clinicMeta[code].full = e.target.value })} />
              <input className="cm-contract" value={meta.contract} placeholder="M-F" onChange={(e) => update((dd) => { dd.clinicMeta[code].contract = e.target.value })} />
              <input className="cm-days" type="number" value={meta.daysOpen} min={0} max={7} onChange={(e) => update((dd) => { dd.clinicMeta[code].daysOpen = +e.target.value })} />
              <span style={{ width: 50, textAlign: "center" }}><input type="checkbox" className="cm-xr-check" checked={!!meta.xrNeed} onChange={(e) => update((dd) => { dd.clinicMeta[code].xrNeed = e.target.checked })} /></span>
              <button className="btn-x" onClick={() => removeClinic(update, data, i)}>✕</button>
            </div>
          )
        })}
      </div>
      <button className="btn-add" onClick={() => addClinic(update, data)}>+ Add Clinic</button>

      <h2 style={{ marginTop: 24 }}>🏥 Surgery Locations</h2>
      <p className="desc-text-lg">Surgery sites used as default surgery shadowing locations.</p>
      <div className="surg-locations">
        {data.surgLocations.map((loc, i) => (
          <div className="surg-loc-row" key={i}>
            <input value={loc.abbrev} style={{ width: 70, textAlign: "center", fontWeight: 700 }} onChange={(e) => update((dd) => { dd.surgLocations[i].abbrev = e.target.value })} />
            <input value={loc.name} style={{ width: 180 }} onChange={(e) => update((dd) => { dd.surgLocations[i].name = e.target.value })} />
            <select style={{ width: 200 }} value={loc.provider} onChange={(e) => update((dd) => { dd.surgLocations[i].provider = e.target.value })}>
              <option value="">— Assign Surgeon/PA —</option>
              {data.providers.map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}
            </select>
            <input value={loc.notes || ""} placeholder="Notes..." style={{ flex: 1, minWidth: 120 }} onChange={(e) => update((dd) => { dd.surgLocations[i].notes = e.target.value })} />
            <button className="btn-x" onClick={() => update((dd) => { dd.surgLocations.splice(i, 1) })}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn-add" onClick={() => update((dd) => { dd.surgLocations.push({ name: "", abbrev: "", provider: "", notes: "" }) })} style={{ marginTop: 8 }}>+ Add Surgery Location</button>

      <h2 style={{ marginTop: 24 }}>📍 Clinic Regions</h2>
      <p className="desc-text-lg">Group clinics into regions. Staff assigned to a region get those clinics prioritized.</p>
      <div>
        {Object.keys(data.clinicRegions).map((name, ri) => {
          const isCity = name === "City"
          const clinics = isCity ? getAutoCity() : data.clinicRegions[name]
          return (
            <div className="region-row" key={name}>
              <input className="region-name-input" value={name} readOnly={isCity} onChange={(e) => renameRegion(update, data, ri, e.target.value)} />
              <div className="region-clinics">
                {data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery).map((code) => {
                  const inRegion = clinics.includes(code)
                  if (isCity) return inRegion ? <span key={code} className="region-chip in-region">{code}</span> : null
                  return <span key={code} className={"region-chip" + (inRegion ? " in-region" : "")} onClick={() => toggleClinicRegion(name, code)}>{code}</span>
                })}
              </div>
              {!isCity && <button className="btn-x" onClick={() => removeRegion(update, ri)}>✕</button>}
            </div>
          )
        })}
      </div>
      <button className="btn-add" onClick={() => update((dd) => { dd.clinicRegions["Region " + (Object.keys(dd.clinicRegions).length + 1)] = [] })} style={{ marginTop: 8 }}>+ Add Region</button>
    </div>
  )
}

// ---- clinic mgmt helpers (operate on the store) ----
function addClinic(update: any, data: any) {
  const code = prompt("Enter new clinic abbreviation (e.g., NW):")?.toUpperCase().trim()
  if (!code) return
  if (data.clinicOrder.includes(code)) { alert("Clinic code already exists."); return }
  const name = prompt("Full clinic name:") || code
  const contract = prompt("Contract days (e.g., M-F):") || "M-F"
  const daysOpen = parseInt(prompt("Days open per week:") || "1") || 1
  update((dd: any) => {
    dd.clinicOrder.push(code)
    dd.clinicMeta[code] = { full: name, contract, daysOpen, xrNeed: false }
    dd.scheduleA[code] = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] }
    dd.scheduleB[code] = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [] }
  })
}

function removeClinic(update: any, data: any, idx: number) {
  const code = data.clinicOrder[idx]
  if (!confirm(`Remove ${code} (${data.clinicMeta[code]?.full || code})?`)) return
  update((dd: any) => {
    dd.clinicOrder.splice(idx, 1)
    delete dd.clinicMeta[code]
    delete dd.scheduleA[code]
    delete dd.scheduleB[code]
    Object.keys(dd.iaPreferences).forEach((k) => { dd.iaPreferences[k] = (dd.iaPreferences[k] || []).filter((c: string) => c !== code) })
  })
}

function renameClinicCode(update: any, data: any, idx: number, raw: string) {
  const newCode = raw.toUpperCase().trim()
  const oldCode = data.clinicOrder[idx]
  if (newCode === oldCode || !newCode) return
  if (data.clinicOrder.includes(newCode)) { alert("Code already exists."); return }
  update((dd: any) => {
    dd.clinicOrder[idx] = newCode
    dd.clinicMeta[newCode] = dd.clinicMeta[oldCode]; delete dd.clinicMeta[oldCode]
    if (dd.scheduleA[oldCode]) { dd.scheduleA[newCode] = dd.scheduleA[oldCode]; delete dd.scheduleA[oldCode] }
    if (dd.scheduleB[oldCode]) { dd.scheduleB[newCode] = dd.scheduleB[oldCode]; delete dd.scheduleB[oldCode] }
    Object.keys(dd.iaPreferences).forEach((k) => { dd.iaPreferences[k] = (dd.iaPreferences[k] || []).map((c: string) => (c === oldCode ? newCode : c)) })
  })
}

function removeRegion(update: any, idx: number) {
  update((dd: any) => {
    const keys = Object.keys(dd.clinicRegions)
    if (keys[idx] === "City") return
    delete dd.clinicRegions[keys[idx]]
  })
}

function renameRegion(update: any, data: any, idx: number, newName: string) {
  update((dd: any) => {
    const keys = Object.keys(dd.clinicRegions)
    const oldName = keys[idx]
    if (oldName === newName || !newName || oldName === "City") return
    const clinics = dd.clinicRegions[oldName]
    delete dd.clinicRegions[oldName]
    dd.clinicRegions[newName] = clinics
    Object.keys(dd.staffRegions).forEach((k) => { if (dd.staffRegions[k] === oldName) dd.staffRegions[k] = newName })
  })
}
