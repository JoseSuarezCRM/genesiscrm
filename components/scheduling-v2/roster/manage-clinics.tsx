"use client"

import { useScheduling } from "../store"
import { usePlannerToast } from "../toast"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { DAYS } from "@/lib/scheduling/constants"
import { CITY, getAutoCity } from "@/lib/scheduling/regions"

// Roster → Manage Clinics (renderClinicMgmt, renderSurgeryLocationsMgmt,
// renderRegionEditor).
//
// A clinic code is a foreign key in everything but name — it keys clinicMeta,
// both A/B schedules and every preference list — so renaming one rewrites all of
// them together, and removing one strips it out of the same places.

export default function ManageClinics() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()

  const addClinic = () => {
    const raw = window.prompt("Enter new clinic abbreviation (e.g. NW):")?.toUpperCase().trim()
    if (!raw) return
    if (data.clinicOrder.includes(raw)) { toast("Clinic code already exists.", "warn"); return }
    const name = window.prompt("Full clinic name:")?.trim() || raw
    const contract = window.prompt("Contract days (e.g. M-F, T,TH):")?.trim() || "M-F"
    const daysOpen = parseInt(window.prompt("Days open per week:") || "1", 10) || 1
    update((dd) => {
      dd.clinicOrder.push(raw)
      dd.clinicMeta[raw] = { full: name, contract, daysOpen, xrNeed: false }
      for (const sched of [dd.scheduleA, dd.scheduleB]) {
        if (!sched[raw]) { sched[raw] = {}; for (const day of DAYS) sched[raw][day] = [] }
      }
    })
    toast(`Added ${raw} — ${name}`, "success")
  }

  const removeClinic = async (idx: number) => {
    const code = data.clinicOrder[idx]
    const label = data.clinicMeta[code]?.full || code
    if (!(await confirmDialog(
      `Remove ${code} (${label})? It will also be removed from both A/B schedules and from everyone's clinic preferences.`
    ))) return
    update((dd) => {
      dd.clinicOrder.splice(idx, 1)
      delete dd.clinicMeta[code]
      delete dd.scheduleA[code]
      delete dd.scheduleB[code]
      for (const store of [dd.iaPreferences, dd.xrtPreferences, dd.iaExcludedClinics]) {
        for (const k of Object.keys(store)) store[k] = (store[k] || []).filter((c) => c !== code)
      }
      for (const r of Object.keys(dd.clinicRegions)) {
        dd.clinicRegions[r] = dd.clinicRegions[r].filter((c) => c !== code)
      }
    })
    toast(`Removed ${code}`, "success")
  }

  const renameCode = (idx: number, raw: string) => {
    const next = raw.toUpperCase().trim()
    const old = data.clinicOrder[idx]
    if (!next || next === old) return
    if (data.clinicOrder.includes(next)) { toast("Code already exists.", "warn"); return }
    update((dd) => {
      dd.clinicOrder[idx] = next
      dd.clinicMeta[next] = dd.clinicMeta[old]
      delete dd.clinicMeta[old]
      for (const sched of [dd.scheduleA, dd.scheduleB]) {
        if (sched[old]) { sched[next] = sched[old]; delete sched[old] }
      }
      for (const store of [dd.iaPreferences, dd.xrtPreferences, dd.iaExcludedClinics]) {
        for (const k of Object.keys(store)) store[k] = (store[k] || []).map((c) => (c === old ? next : c))
      }
      for (const r of Object.keys(dd.clinicRegions)) {
        dd.clinicRegions[r] = dd.clinicRegions[r].map((c) => (c === old ? next : c))
      }
    })
    toast(`Renamed ${old} → ${next} everywhere`, "success")
  }

  const setMeta = (code: string, key: string, val: any) =>
    update((dd) => { if (dd.clinicMeta[code]) (dd.clinicMeta[code] as any)[key] = val })

  return (
    <div>
      <h2>Manage Clinics</h2>
      <p className="desc-text-lg">
        Add, remove, or update clinic names and abbreviations. Changes propagate everywhere the code is
        used — the A/B schedule, clinic preferences and regions.
      </p>

      <div
        style={{
          display: "flex", gap: 8, marginBottom: 8, fontSize: "10.5px", textTransform: "uppercase",
          letterSpacing: ".05em", fontWeight: 600, color: "var(--ink-faint)", padding: "4px 12px",
          position: "sticky", top: 0, background: "var(--bg)", zIndex: 5, borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ width: 55 }}>Code</span>
        <span style={{ width: 200 }}>Full Name</span>
        <span style={{ width: 90 }}>Contract</span>
        <span style={{ width: 45, textAlign: "center" }}>Days</span>
        <span style={{ width: 50, textAlign: "center" }}>XR Need</span>
        <span style={{ width: 30 }} />
      </div>

      <div className="surg-locations">
        {data.clinicOrder.map((code, i) => {
          const meta = data.clinicMeta[code] ?? { full: "", contract: "", daysOpen: 0, xrNeed: false }
          return (
            <div className="clinic-mgmt-row" key={code}>
              <input
                type="text" className="cm-code" defaultValue={code}
                onBlur={(e) => renameCode(i, e.target.value)}
              />
              <input
                type="text" className="cm-name" value={meta.full}
                onChange={(e) => setMeta(code, "full", e.target.value)}
              />
              <input
                type="text" className="cm-contract" value={meta.contract} placeholder="M-F"
                onChange={(e) => setMeta(code, "contract", e.target.value)}
              />
              <input
                type="number" className="cm-days" min={0} max={7} value={meta.daysOpen}
                onChange={(e) => setMeta(code, "daysOpen", +e.target.value)}
              />
              <span style={{ width: 50, textAlign: "center" }}>
                <input
                  type="checkbox" className="cm-xr-check" checked={!!meta.xrNeed}
                  onChange={(e) => setMeta(code, "xrNeed", e.target.checked)}
                />
              </span>
              <button className="btn-x" onClick={() => void removeClinic(i)}>×</button>
            </div>
          )
        })}
      </div>
      <button className="btn-add" onClick={addClinic}>+ Add Clinic</button>

      <SurgeryLocations />
      <Regions />
    </div>
  )
}

function SurgeryLocations() {
  const { data, update } = useScheduling()
  const set = (i: number, key: string, val: string) =>
    update((dd) => { (dd.surgLocations[i] as any)[key] = val })

  return (
    <>
      <h2 style={{ marginTop: 24 }}>🏥 Surgery Locations</h2>
      <p className="desc-text-lg">
        Define surgery sites where surgeons and PAs operate. These are also the default surgery shadowing
        locations.
      </p>
      <div className="surg-locations">
        {data.surgLocations.map((loc, i) => (
          <div className="surg-loc-row" key={i}>
            <input
              value={loc.abbrev} style={{ width: 70, textAlign: "center", fontWeight: 700 }}
              onChange={(e) => set(i, "abbrev", e.target.value)}
            />
            <input value={loc.name} style={{ width: 180 }} onChange={(e) => set(i, "name", e.target.value)} />
            <select style={{ width: 200 }} value={loc.provider || ""} onChange={(e) => set(i, "provider", e.target.value)}>
              <option value="">— Assign Surgeon/PA —</option>
              {data.providers.map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}
            </select>
            <input
              value={loc.notes || ""} placeholder="Notes…" style={{ flex: 1, minWidth: 120 }}
              onChange={(e) => set(i, "notes", e.target.value)}
            />
            <button className="btn-x" onClick={() => update((dd) => { dd.surgLocations.splice(i, 1) })}>×</button>
          </div>
        ))}
      </div>
      <button
        className="btn-add" style={{ marginTop: 8 }}
        onClick={() => update((dd) => { dd.surgLocations.push({ name: "", abbrev: "", provider: "", notes: "" }) })}
      >
        + Add Surgery Location
      </button>
    </>
  )
}

function Regions() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const regionNames = Object.keys(data.clinicRegions)
  const clinics = data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery)

  /** A clinic belongs to at most one region, so adding it elsewhere removes it here. */
  const toggle = (region: string, code: string) =>
    update((dd) => {
      const list = dd.clinicRegions[region] || []
      const i = list.indexOf(code)
      if (i >= 0) list.splice(i, 1)
      else {
        for (const r of Object.keys(dd.clinicRegions)) {
          if (r === CITY || r === region) continue
          const ri = dd.clinicRegions[r].indexOf(code)
          if (ri >= 0) dd.clinicRegions[r].splice(ri, 1)
        }
        list.push(code)
      }
      dd.clinicRegions[region] = list
    })

  const rename = (idx: number, next: string) =>
    update((dd) => {
      const keys = Object.keys(dd.clinicRegions)
      const old = keys[idx]
      if (!next || old === next || dd.clinicRegions[next]) return
      const list = dd.clinicRegions[old]
      delete dd.clinicRegions[old]
      dd.clinicRegions[next] = list
      for (const k of Object.keys(dd.staffRegions)) {
        if (dd.staffRegions[k] === old) dd.staffRegions[k] = next
      }
      for (const p of dd.providers) {
        if (p.mainRegion === old) p.mainRegion = next
        if (p.secondRegion === old) p.secondRegion = next
      }
    })

  return (
    <>
      <h2 style={{ marginTop: 24 }}>📍 Clinic Regions</h2>
      <p className="desc-text-lg">
        Group clinics into regions. Staff assigned to a region get those clinics prioritised by the
        assignment engine. <strong>City</strong> is whatever is left over, so it can&apos;t be edited directly.
      </p>
      <div>
        {regionNames.map((name, ri) => {
          const isCity = name === CITY
          const inRegion = isCity
            ? getAutoCity(data.clinicRegions, data.clinicOrder, data.clinicMeta)
            : data.clinicRegions[name]
          return (
            <div className="region-row" key={name}>
              <input
                className="region-name-input" defaultValue={name} readOnly={isCity}
                onBlur={(e) => { if (!isCity) rename(ri, e.target.value.trim()) }}
              />
              <div className="region-clinics">
                {clinics.map((code) => {
                  const on = inRegion.includes(code)
                  if (isCity && !on) return null
                  return (
                    <span
                      key={code}
                      className={"region-chip" + (on ? " in-region" : "")}
                      title={
                        isCity
                          ? `${data.clinicMeta[code]?.full ?? code} (automatic)`
                          : `Click to ${on ? "remove" : "add"} ${data.clinicMeta[code]?.full ?? code}`
                      }
                      onClick={isCity ? undefined : () => toggle(name, code)}
                    >
                      {code}
                    </span>
                  )
                })}
              </div>
              {!isCity && (
                <button
                  className="btn-x"
                  onClick={() => update((dd) => { delete dd.clinicRegions[name] })}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        className="btn-add" style={{ marginTop: 8 }}
        onClick={() => update((dd) => {
          let n = Object.keys(dd.clinicRegions).length + 1
          while (dd.clinicRegions["Region " + n]) n++
          dd.clinicRegions["Region " + n] = []
        })}
      >
        + Add Region
      </button>
    </>
  )
}
