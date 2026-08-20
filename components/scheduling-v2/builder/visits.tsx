"use client"

import { useEffect } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { d, monday, addDays, toISODate, weekType } from "@/lib/scheduling/dates"
import { providerActive, isOnPTO, isOutOverride, getCoverOverrides } from "@/lib/scheduling/providers"
import { iaGetWeekDays, iaProviderAtClinic, generateInternAssignments } from "@/lib/scheduling/assign-interns"
import { generateXrtAssignments } from "@/lib/scheduling/assign-xrt"

export default function VisitCount() {
  const { data, ephemeral, setEphemeral, update } = useScheduling()

  // Initialize the week to the configured start week.
  useEffect(() => {
    if (!ephemeral.iaWeekStart) {
      const sw = monday(d(data.settings.startWeek) || new Date())
      setEphemeral((e) => { e.iaWeekStart = toISODate(sw) })
    }
  }, [ephemeral.iaWeekStart, data.settings.startWeek, setEphemeral])

  const weekStart = ephemeral.iaWeekStart ? monday(d(ephemeral.iaWeekStart)!) : monday(d(data.settings.startWeek) || new Date())
  const days = iaGetWeekDays(weekStart)
  const wt = weekType(weekStart, data.settings.startWeek)

  const activeProvsAt = (code: string, dayName: string, date: Date) => {
    const provs = iaProviderAtClinic(data, code, dayName, weekStart)
    const active = provs.filter((init) => {
      const p = data.providers.find((pr) => pr.init === init)
      if (p && !providerActive(p, weekStart)) return false
      if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) return false
      if (isOutOverride(init, date, code, data.scheduleOverrides, data.recurringRules)) return false
      return true
    })
    const covers = getCoverOverrides(date, code, data.scheduleOverrides)
    return { active, covers, total: active.length + covers.length }
  }

  const autoVol = (code: string, di: number, date: Date, dayName: string) => {
    const { active, covers } = activeProvsAt(code, dayName, date)
    let v = 0
    active.forEach((init) => (v += init === "NH" ? 65 : 30))
    covers.forEach((c) => (v += c.init === "NH" ? 65 : 30))
    return v
  }

  const effVol = (code: string, di: number, date: Date, dayName: string) => {
    const key = code + "-" + di
    if (ephemeral.iaVolumes[key] !== undefined) return ephemeral.iaVolumes[key]
    return autoVol(code, di, date, dayName)
  }

  const setWeek = (iso: string) => setEphemeral((e) => { e.iaWeekStart = toISODate(monday(d(iso)!)); e.iaVolumes = {}; e.iaAssignments = {} })
  const shiftWeek = (n: number) => setEphemeral((e) => { e.iaWeekStart = toISODate(addDays(weekStart, n * 7)); e.iaVolumes = {}; e.iaAssignments = {} })

  const buildEffectiveVolumes = () => {
    const vols: Record<string, number> = {}
    data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery).forEach((code) => {
      days.forEach((dd) => { vols[code + "-" + dd.dayIdx] = effVol(code, dd.dayIdx, dd.date, dd.dayName) })
    })
    return vols
  }

  const genInterns = () => {
    const vols = buildEffectiveVolumes()
    const { assignments, rotationHistory } = generateInternAssignments(data, weekStart, vols, ephemeral.iaManualOverrides)
    setEphemeral((e) => { e.iaVolumes = vols; e.iaAssignments = assignments })
    update((dd) => { dd.iaRotationHistory = rotationHistory })
  }

  const genXrt = () => {
    const vols = buildEffectiveVolumes()
    const { assignments, rotationHistory } = generateXrtAssignments(data, weekStart, vols, ephemeral.xrtManualOverrides)
    setEphemeral((e) => { e.iaVolumes = vols })
    update((dd) => { dd.xrtAssignments = assignments; dd.xrtRotationHistory = rotationHistory })
  }

  return (
    <div>
      <h2>Weekly Patient Volume by Clinic</h2>
      <div className="callout">Enter patients per clinic per day. Shared with the <strong>Intern</strong> and <strong>XRT</strong> engines. <strong>Grey cells = no provider scheduled.</strong></div>
      <div className="ia-week-nav no-print">
        <label style={{ fontWeight: 600, fontSize: ".82rem" }}>Week of:</label>
        <input type="date" value={toISODate(weekStart)} onChange={(e) => setWeek(e.target.value)} />
        <button className="btn-add" style={{ margin: 0 }} onClick={() => shiftWeek(-1)}>← Prev</button>
        <button className="btn-add" style={{ margin: 0 }} onClick={() => shiftWeek(1)}>Next →</button>
        <span style={{ fontSize: ".75rem", fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: wt === "A" ? "#d4edda" : "#cce5ff", color: wt === "A" ? "#155724" : "#004085" }}>{wt} Week</span>
        <span style={{ color: "#888", fontSize: ".79rem" }}>|</span>
        <button className="btn-add" style={{ margin: 0, background: "#8b0000", color: "#fff", borderColor: "#8b0000" }} onClick={genInterns}>⚡ Generate Intern Assignments</button>
        <button className="btn-add" style={{ margin: 0, background: "#9a3412", color: "#fff", borderColor: "#9a3412" }} onClick={genXrt}>⚡ Generate XRT Assignments</button>
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="ia-vol-table">
          <thead><tr><th>Clinic</th>{days.map((dd) => <th key={dd.dayIdx}>{dd.label}<br /><span style={{ fontWeight: 400, fontSize: ".65rem" }}>{dd.dateStr}</span></th>)}<th style={{ width: 50 }}>Total</th></tr></thead>
          <tbody>
            {data.clinicOrder.filter((code) => !data.clinicMeta[code]?.isSurgery).map((code) => {
              const meta = data.clinicMeta[code]
              if (!meta) return null
              const color = IA_CLINIC_COLORS[code] || "#888"
              let total = 0
              const cells = days.map((dd) => {
                const { active, covers, total: totalActive } = activeProvsAt(code, dd.dayName, dd.date)
                const disabled = totalActive === 0
                const val = disabled ? 0 : effVol(code, dd.dayIdx, dd.date, dd.dayName)
                total += val
                const provLabel = totalActive > 0 ? active.concat(covers.map((c) => c.init)).join(", ") : "No provider"
                return (
                  <td key={dd.dayIdx} className={disabled ? "no-prov-cell" : ""} title={provLabel}>
                    <input type="number" min={0} max={99} value={disabled ? "" : val} disabled={disabled}
                      style={disabled ? { background: "#f0f0f0", color: "#bbb" } : undefined}
                      onChange={(e) => { const v = parseInt(e.target.value) || 0; setEphemeral((ep) => { ep.iaVolumes[code + "-" + dd.dayIdx] = v }) }} />
                    <div style={{ fontSize: ".6rem", color: disabled ? "#ccc" : "#888", textAlign: "center", marginTop: 1 }}>{disabled ? "—" : provLabel}</div>
                  </td>
                )
              })
              return (
                <tr key={code}>
                  <td className="ia-v-clinic" style={{ borderLeft: `4px solid ${color}` }}>{meta.full} <span style={{ color: "#888", fontWeight: 400, fontSize: ".72rem" }}>({code})</span>{meta.xrNeed && <span style={{ background: "#fff7ed", color: "#9a3412", fontSize: ".6rem", padding: "1px 4px", borderRadius: 3, border: "1px solid #fed7aa", marginLeft: 4 }}>XR</span>}</td>
                  {cells}
                  <td style={{ textAlign: "center", fontWeight: 700, fontSize: ".84rem" }}>{total || ""}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
