"use client"

import { useEffect, useMemo } from "react"
import { useScheduling } from "../store"
import { usePlannerToast } from "../toast"
import {
  DEFAULT_PTS_PER_PROVIDER, HIGH_VOLUME_PROVIDER, HIGH_VOLUME_PTS, IA_CLINIC_COLORS,
} from "@/lib/scheduling/constants"
import { addDays, clinicToday, d, monday, weekType, ymd } from "@/lib/scheduling/dates"
import { activeProvidersAt, generateInternAssignments, getWeekDays } from "@/lib/scheduling/assign-interns"
import { generateXrtAssignments } from "@/lib/scheduling/assign-xrt"

// Schedule Builder → Visit Count (iaRenderVolTable).
//
// The numbers here are the input to everything downstream: the staffing tiers
// turn them into headcount, and both Generate buttons turn that into
// assignments. This is the only place in v10 that runs either engine.

export default function VisitCount() {
  const { data, ephemeral, setEphemeral, update } = useScheduling()
  const toast = usePlannerToast()

  const weekStart = useMemo(
    () => (ephemeral.iaWeekStart ? d(ephemeral.iaWeekStart)! : monday(clinicToday())),
    [ephemeral.iaWeekStart]
  )

  // Default to the current week rather than making someone pick one first.
  useEffect(() => {
    if (!ephemeral.iaWeekStart) {
      setEphemeral((e) => { e.iaWeekStart = ymd(monday(clinicToday())) })
    }
  }, [ephemeral.iaWeekStart, setEphemeral])

  const days = useMemo(() => getWeekDays(weekStart), [weekStart])
  const wType = weekType(weekStart, data.settings.startWeek)
  const clinics = data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery)

  /**
   * Per clinic-day: who is actually working, and the volume to use. A cell with
   * no provider can't have patients, so it's disabled; a cell nobody has typed
   * into yet is seeded at the provider's usual load rather than left at zero,
   * which would silently mean "no staff needed".
   */
  const cellInfo = useMemo(() => {
    const out: Record<string, { provs: string[]; suggested: number }> = {}
    for (const code of clinics) {
      for (const dd of days) {
        const { scheduled, covers } = activeProvidersAt(data, weekStart, code, dd.dayName, dd.date)
        const provs = [...scheduled, ...covers]
        const suggested = provs.reduce(
          (sum, init) => sum + (init === HIGH_VOLUME_PROVIDER ? HIGH_VOLUME_PTS : DEFAULT_PTS_PER_PROVIDER),
          0
        )
        out[`${code}-${dd.dayIdx}`] = { provs, suggested }
      }
    }
    return out
  }, [data, clinics, days, weekStart])

  // Seed the untouched cells for this week once its provider layout is known.
  useEffect(() => {
    const missing = Object.entries(cellInfo).filter(
      ([key, info]) => ephemeral.iaVolumes[key] === undefined && info.provs.length > 0
    )
    if (!missing.length) return
    setEphemeral((e) => { for (const [key, info] of missing) e.iaVolumes[key] = info.suggested })
  }, [cellInfo, ephemeral.iaVolumes, setEphemeral])

  const shiftWeek = (n: number) =>
    setEphemeral((e) => { e.iaWeekStart = ymd(addDays(weekStart, n * 7)); e.iaVolumes = {} })

  const genInterns = () => {
    const { assignments, rotationHistory } = generateInternAssignments(
      data, weekStart, ephemeral.iaVolumes, ephemeral.iaManualOverrides
    )
    setEphemeral((e) => { e.iaAssignments = assignments })
    update((dd) => { dd.iaRotationHistory = rotationHistory })
    const placed = new Set(Object.values(assignments).filter((v) => v !== "Off" && v !== "Extra/Admin")).size
    toast(placed ? "Intern assignments generated" : "No clinics needed interns this week", placed ? "success" : "warn")
  }

  const genXrt = () => {
    const { assignments, rotationHistory, error } = generateXrtAssignments(
      data, weekStart, ephemeral.iaVolumes, ephemeral.xrtManualOverrides
    )
    if (error) { toast(error, "warn"); return }
    update((dd) => { dd.xrtAssignments = assignments; dd.xrtRotationHistory = rotationHistory })
    toast("XRT assignments generated", "success")
  }

  return (
    <div>
      <h2>Weekly Patient Volume by Clinic</h2>
      <div className="callout">
        Enter the number of patients per clinic per day. This data feeds both the{" "}
        <strong>intern</strong> and <strong>XRT</strong> assignment engines — enter it once here.{" "}
        <strong style={{ color: "var(--ink)" }}>Grey cells have no provider scheduled</strong> that day.
      </div>

      <div className="ia-week-nav no-print">
        <label style={{ fontWeight: 600, fontSize: 13 }}>Week of:</label>
        <input
          type="date"
          value={ymd(weekStart)}
          onChange={(e) => setEphemeral((eph) => {
            const picked = d(e.target.value)
            if (picked) { eph.iaWeekStart = ymd(monday(picked)); eph.iaVolumes = {} }
          })}
        />
        <button className="btn-add" style={{ margin: 0 }} onClick={() => shiftWeek(-1)}>Prev</button>
        <button className="btn-add" style={{ margin: 0 }} onClick={() => shiftWeek(1)}>Next</button>
        <span
          style={{
            fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
            background: wType === "A" ? "#d4edda" : "#cce5ff",
            color: wType === "A" ? "#155724" : "#004085",
          }}
        >
          {wType} Week
        </span>
        <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>|</span>
        <button className="btn-add" style={{ margin: 0 }} onClick={genInterns}>Generate Intern Assignments</button>
        <button
          className="btn-add"
          style={{ margin: 0, background: "var(--blue)", borderColor: "var(--blue)", color: "#fff" }}
          onClick={genXrt}
        >
          Generate XRT Assignments
        </button>
      </div>

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="ia-vol-table">
          <thead>
            <tr>
              <th>Clinic</th>
              {days.map((dd) => (
                <th key={dd.dayIdx}>
                  {dd.label}
                  <br />
                  <span style={{ fontWeight: 400, fontSize: ".65rem" }}>{dd.dateStr}</span>
                </th>
              ))}
              <th style={{ width: 50 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((code) => {
              const meta = data.clinicMeta[code]
              if (!meta) return null
              const color = IA_CLINIC_COLORS[code] || "#888"
              const total = days.reduce((s, dd) => s + (ephemeral.iaVolumes[`${code}-${dd.dayIdx}`] || 0), 0)

              return (
                <tr key={code}>
                  <td className="ia-v-clinic" style={{ borderLeft: `4px solid ${color}` }}>
                    {meta.full}{" "}
                    <span style={{ color: "var(--ink-faint)", fontWeight: 400, fontSize: ".72rem" }}>({code})</span>
                    {meta.xrNeed && (
                      <span style={{ background: "var(--flag-soft)", color: "var(--flag)", fontSize: ".6rem", padding: "1px 4px", borderRadius: 3, border: "1px solid var(--flag)", marginLeft: 4 }}>
                        XR
                      </span>
                    )}
                  </td>
                  {days.map((dd) => {
                    const key = `${code}-${dd.dayIdx}`
                    const info = cellInfo[key] ?? { provs: [], suggested: 0 }
                    const disabled = info.provs.length === 0
                    const label = disabled ? "No provider" : info.provs.join(", ")
                    return (
                      <td key={key} className={disabled ? "no-prov-cell" : undefined} title={label}>
                        <input
                          type="number" min={0} max={99} disabled={disabled}
                          value={ephemeral.iaVolumes[key] ?? 0}
                          style={disabled ? { background: "var(--surface-alt)", color: "var(--ink-faint)" } : undefined}
                          onChange={(e) => setEphemeral((eph) => { eph.iaVolumes[key] = parseInt(e.target.value, 10) || 0 })}
                        />
                        <div style={{ fontSize: ".6rem", color: disabled ? "var(--ink-faint)" : "var(--ink-muted)", textAlign: "center", marginTop: 1 }}>
                          {disabled ? "—" : label}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ textAlign: "center", fontWeight: 700, fontSize: ".84rem" }}>{total || ""}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="desc-text" style={{ marginTop: 12 }}>
        Volumes and the assignments generated from them are scoped to this session — regenerate after a
        schedule or PTO change. Rotation history, which keeps the engine from sending the same person to the
        same clinic every week, is saved.
      </p>
    </div>
  )
}
