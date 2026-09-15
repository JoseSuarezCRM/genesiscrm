"use client"

import { useScheduling } from "../store"
import { ProvChip, SectionRow } from "../shared"
import { DAYS } from "@/lib/scheduling/constants"
import { addDays, clinicToday, fmtShort, monday, weekType, ymd } from "@/lib/scheduling/dates"
import {
  getCoverOverrides, getLateStart, isOnPTO, isOutOverride, providerActive,
} from "@/lib/scheduling/providers"

// Master Schedule → Staff View (the dashboard's renderCleanSchedule).
//
// The one screen most of the clinic looks at, so it stays deliberately plain:
// this week and next, no controls, no editing. Everything that changes the grid
// lives in Schedule Builder.

export default function StaffView() {
  const { data } = useScheduling()
  const thisMonday = monday(clinicToday())
  const weeks = [
    { start: thisMonday, label: "This Week", isCurrent: true },
    { start: addDays(thisMonday, 7), label: "Next Week", isCurrent: false },
  ]

  return (
    <div style={{ overflowX: "auto" }}>
      {weeks.map((wk) => {
        const wType = weekType(wk.start, data.settings.startWeek)
        const sched = wType === "A" ? data.scheduleA : data.scheduleB
        const weekEnd = addDays(wk.start, 4)
        let surgSep = false

        return (
          <div
            key={wk.label}
            style={{
              marginBottom: 24,
              ...(wk.isCurrent ? { borderLeft: "3px solid var(--accent)", paddingLeft: 12 } : {}),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>{wk.label}</h2>
              <span className={"week-badge " + (wType === "A" ? "wk-a" : "wk-b")} style={{ fontSize: ".8rem" }}>
                {wType} WEEK
              </span>
              <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>
                {fmtShort(wk.start)} → {fmtShort(weekEnd)}
              </span>
              {wk.isCurrent && (
                <span style={{ background: "var(--accent)", color: "#fff", fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 700, letterSpacing: ".05em" }}>
                  CURRENT
                </span>
              )}
            </div>

            <table className="cal-grid" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>CLINIC</th>
                  {DAYS.map((day, di) => {
                    const dt = addDays(wk.start, di)
                    return (
                      <th key={day}>
                        {day}
                        <br />
                        <span style={{ fontWeight: 400, opacity: 0.7 }}>{dt.getMonth() + 1}/{dt.getDate()}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {data.clinicOrder.map((code) => {
                  const meta = data.clinicMeta[code]
                  if (!meta) return null
                  const s = sched[code] || {}
                  const isSurg = !!meta.isSurgery
                  const showSep = isSurg && !surgSep
                  if (showSep) surgSep = true

                  return (
                    <ClinicRow
                      key={code}
                      code={code}
                      showSep={showSep}
                      isSurg={isSurg}
                      metaFull={meta.full}
                      weekStart={wk.start}
                      dayProvs={(day: string) => (s as any)[day] || []}
                    />
                  )
                })}

                {/* Everyone not working, so a gap is visible without cross-reading rows. */}
                <tr>
                  <td className="cal-clinic-label" style={{ background: "var(--surface-alt)", color: "var(--ink-faint)" }}>
                    OFF
                  </td>
                  {DAYS.map((_, di) => {
                    const date = addDays(wk.start, di)
                    const off = data.providers
                      .filter((p) => providerActive(p, wk.start))
                      .filter((p) =>
                        isOnPTO(p.init, date, data.ptoEntries, data.recurringRules) ||
                        data.scheduleOverrides.some(
                          (e) => e.init === p.init && e.action === "out-all" && e.date === ymd(date)
                        )
                      )
                    return (
                      <td key={di} style={{ background: "var(--surface-alt)" }}>
                        {off.map((p) => (
                          <ProvChip key={p.init} init={p.init} providers={data.providers} modClass="on-pto" />
                        ))}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function ClinicRow({
  code, showSep, isSurg, metaFull, weekStart, dayProvs,
}: {
  code: string
  showSep: boolean
  isSurg: boolean
  metaFull: string
  weekStart: Date
  dayProvs: (day: string) => string[]
}) {
  const { data } = useScheduling()

  return (
    <>
      {showSep && <SectionRow colSpan={DAYS.length + 1}>Surgery</SectionRow>}
      <tr>
        <td className="cal-clinic-label" style={isSurg ? { background: "var(--danger-soft)" } : undefined}>
          {metaFull} <span className="badge-contract">{code}</span>
        </td>
        {DAYS.map((day, di) => {
          const date = addDays(weekStart, di)
          const chips: React.ReactNode[] = []

          for (const init of dayProvs(day)) {
            const p = data.providers.find((pr) => pr.init === init)
            if (p && !providerActive(p, weekStart)) continue
            if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) {
              chips.push(<ProvChip key={"pto" + init} init={init} providers={data.providers} modClass="on-pto" title="PTO" />)
            } else if (isOutOverride(init, date, code, data.scheduleOverrides, data.recurringRules)) {
              chips.push(<ProvChip key={"out" + init} init={init} providers={data.providers} modClass="on-out" title="Out" />)
            } else {
              const lt = getLateStart(init, date, code, data.scheduleOverrides)
              chips.push(
                <ProvChip
                  key={init}
                  init={init}
                  providers={data.providers}
                  lateStart={lt}
                  title={lt ? `Late start: ${lt}` : undefined}
                />
              )
            }
          }
          for (const c of getCoverOverrides(date, code, data.scheduleOverrides)) {
            chips.push(
              <ProvChip key={"cov" + c.init} init={c.init} providers={data.providers} modClass="on-cover" title="Covering" />
            )
          }

          const cellBg = isSurg && !chips.length ? "var(--danger-soft)" : !chips.length ? "var(--surface-alt)" : ""
          return <td key={day} style={cellBg ? { background: cellBg } : undefined}>{chips}</td>
        })}
      </tr>
    </>
  )
}
