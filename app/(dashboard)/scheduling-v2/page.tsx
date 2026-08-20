"use client"

import { useMemo, useRef, useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { buildSavePayload, mergeSavedState } from "@/lib/scheduling/state"
import { clinicCalcs, orgKpis } from "@/lib/scheduling/analytics"
import { monday } from "@/lib/scheduling/dates"
import { MONTHS } from "@/lib/scheduling/constants"
import type { Settings } from "@/lib/scheduling/types"

const VOL_CLINICS = ["AR", "EW", "GU", "HP", "JO", "LV", "OB", "SC", "WG"]

const SETTINGS_FIELDS: { key: keyof Settings; label: string; help?: string; type: string; step?: string }[] = [
  { key: "targetPts", label: "Target Pts/Provider/Day", help: "NH runs ~65.", type: "number" },
  { key: "daysPerMonth", label: "Working Days per Month", type: "number" },
  { key: "growthPct", label: "Monthly Growth %", type: "number", step: "0.5" },
  { key: "weeksProject", label: "Weeks to Project", type: "number" },
  { key: "orientDays", label: "Orientation Period (Days)", type: "number" },
  { key: "calWeeks", label: "Calendar Weeks to Show", type: "number" },
  { key: "startWeek", label: "Starting Week A (Monday)", type: "date" },
]

export default function OverviewPage() {
  const { data, update } = useScheduling()
  const fileRef = useRef<HTMLInputElement>(null)
  const [volOpen, setVolOpen] = useState(false)
  const [volMonth, setVolMonth] = useState(MONTHS[new Date().getMonth()])
  const [volYear, setVolYear] = useState(new Date().getFullYear())
  const [volInputs, setVolInputs] = useState<Record<string, string>>({})
  const [volMsg, setVolMsg] = useState("")

  const kpis = useMemo(
    () => orgKpis(data, clinicCalcs(data, monday(new Date()), "A")),
    [data]
  )

  function setSetting(key: keyof Settings, value: string) {
    update((d) => { d.settings[key] = value })
  }

  function exportJSON() {
    const payload = buildSavePayload(data)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "genesis-staffing-" + new Date().toISOString().slice(0, 10) + ".json"
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result))
        const merged = mergeSavedState(parsed)
        update((d) => {
          Object.keys(merged).forEach((k) => { (d as any)[k] = (merged as any)[k] })
        })
        if (fileRef.current) fileRef.current.value = ""
      } catch (err: any) {
        alert("Import failed: " + err.message)
      }
    }
    reader.readAsText(file)
  }

  function loadVolExisting() {
    const next: Record<string, string> = {}
    VOL_CLINICS.forEach((code) => {
      const entry = data.rawVolume.find((v) => v.month === volMonth && v.year === volYear && v.clinic === code)
      next[code] = entry ? String(entry.visits) : ""
    })
    setVolInputs(next)
  }

  function saveVolume() {
    let count = 0
    update((d) => {
      VOL_CLINICS.forEach((code) => {
        const raw = volInputs[code]
        if (raw === undefined || raw === "") return
        const visits = +raw
        const idx = d.rawVolume.findIndex((v) => v.month === volMonth && v.year === volYear && v.clinic === code)
        if (idx >= 0) { d.rawVolume[idx].visits = visits; d.rawVolume[idx]._added = true }
        else d.rawVolume.push({ month: volMonth, year: volYear, clinic: code, visits, _added: true })
        count++
      })
    })
    setVolMsg(`✓ ${count} clinic${count !== 1 ? "s" : ""} saved for ${volMonth} ${volYear}.`)
    setTimeout(() => setVolMsg(""), 3000)
  }

  return (
    <div>
      {/* SETTINGS */}
      <div className="section no-print">
        <h2>Settings</h2>
        <div className="settings-grid">
          {SETTINGS_FIELDS.map((f) => (
            <div className="setting-item" key={f.key}>
              <label>{f.label}</label>
              <input
                type={f.type}
                step={f.step}
                value={data.settings[f.key]}
                onChange={(e) => setSetting(f.key, e.target.value)}
              />
              {f.help && <span className="help">{f.help}</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: ".75rem", textTransform: "uppercase", color: "#555", letterSpacing: ".4px" }}>Data</strong>
          <button className="btn-add" style={{ margin: 0 }} onClick={exportJSON}>⬇ Export JSON</button>
          <label className="btn-add" style={{ cursor: "pointer", margin: 0 }}>
            ⬆ Import JSON
            <input ref={fileRef} type="file" accept=".json" onChange={importJSON} style={{ display: "none" }} />
          </label>
          <button className="btn-add" style={{ margin: 0 }} onClick={() => { setVolOpen(true); loadVolExisting() }}>
            📊 Update Monthly Volume
          </button>
          <span style={{ fontSize: ".71rem", color: "#888" }}>
            Export saves providers, schedules, PTO, interns, XRTs, staffing rules &amp; settings. Re-import to restore.
          </span>
        </div>
      </div>

      {/* SNAPSHOT */}
      <div className="section">
        <h2>Organization Snapshot</h2>
        <div className="kpi-row">
          <div className="kpi blue"><div className="label">Active Providers</div><div className="value">{kpis.activeCount}</div><div className="sub">of {kpis.rosterCount} roster</div></div>
          <div className="kpi"><div className="label">Total Monthly Volume</div><div className="value">{kpis.totalVol.toLocaleString()}</div><div className="sub">across {kpis.clinicCount} clinics</div></div>
          <div className={`kpi ${kpis.totalUtil > 100 ? "red" : kpis.totalUtil > 85 ? "orange" : "green"}`}><div className="label">Org-Wide Utilization</div><div className="value">{kpis.totalUtil}%</div><div className="sub">{kpis.totalCap.toLocaleString()} capacity/mo</div></div>
          <div className={`kpi ${kpis.under > 0 ? "red" : "green"}`}><div className="label">Clinics Over Capacity</div><div className="value">{kpis.under}</div><div className="sub">need providers</div></div>
          <div className="kpi blue"><div className="label">Clinics Under 70%</div><div className="value">{kpis.over}</div><div className="sub">capacity available</div></div>
        </div>
      </div>

      {/* VOLUME MODAL */}
      {volOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setVolOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 10, padding: "24px 28px", maxWidth: 480, width: "92%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0 }}>Add / Update Monthly Volume</h3>
              <button className="btn-x" style={{ fontSize: "1.1rem" }} onClick={() => setVolOpen(false)}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end" }}>
              <div><label className="sm-label">Month</label>
                <select value={volMonth} onChange={(e) => setVolMonth(e.target.value)} style={{ width: 130 }}>
                  {MONTHS.map((m) => <option key={m}>{m}</option>)}
                </select></div>
              <div><label className="sm-label">Year</label>
                <input type="number" value={volYear} onChange={(e) => setVolYear(+e.target.value)} style={{ width: 80 }} /></div>
              <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={loadVolExisting}>Load existing</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
              <thead><tr>
                <th style={{ textAlign: "left" }}>Clinic</th>
                <th style={{ textAlign: "center" }}>Visits</th>
              </tr></thead>
              <tbody>
                {VOL_CLINICS.map((code) => (
                  <tr key={code}>
                    <td><strong>{code}</strong> <span style={{ color: "#888" }}>{data.clinicMeta[code]?.full || ""}</span></td>
                    <td style={{ textAlign: "center" }}>
                      <input type="number" min={0} value={volInputs[code] ?? ""} placeholder="0"
                        onChange={(e) => setVolInputs((p) => ({ ...p, [code]: e.target.value }))} style={{ width: 80, textAlign: "center" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button className="btn-add" style={{ margin: 0 }} onClick={saveVolume}>✓ Save Data</button>
              <button onClick={() => setVolOpen(false)} style={{ background: "#fff", border: "1px solid #ddd", color: "#555", padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontSize: ".82rem" }}>Cancel</button>
            </div>
            {volMsg && <div style={{ marginTop: 8, fontSize: ".78rem", color: "#2ecc40" }}>{volMsg}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
