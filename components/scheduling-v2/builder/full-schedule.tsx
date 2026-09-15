"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useScheduling } from "../store"
import { ProvChip, SectionRow } from "../shared"
import { usePlannerToast } from "../toast"
import TaskPicker from "./task-picker"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { DAYS, EXTRA_ADMIN, OFF } from "@/lib/scheduling/constants"
import { addDays, clinicToday, fmtShort, monday, weekType, ymd } from "@/lib/scheduling/dates"
import {
  getCoverOverrides, getLateStart, isOnPTO, isOutOverride, isRecurringRuleMatch, providerActive,
} from "@/lib/scheduling/providers"
import { getStaffingRequirement, isXrtRole } from "@/lib/scheduling/staffing"
import { getActiveInterns } from "@/lib/scheduling/assign-interns"
import { getActiveXRTs } from "@/lib/scheduling/assign-xrt"
import { d } from "@/lib/scheduling/dates"
import type { DayName, OnCallWeek } from "@/lib/scheduling/types"

// Schedule Builder → Full Schedule (renderMasterSchedule).
//
// The working grid: every week from the anchor date forward, with the A/B
// rotation resolved against PTO, overrides and generated assignments. Unlike
// Master Schedule → Staff View this one is editable in place — drag a provider
// to a different clinic-day, drop one onto OFF to log a day off, annotate a cell,
// and set the on-call PA.

interface DragPayload {
  init: string
  clinic: string
  day: DayName
  wtype: "A" | "B"
}

export default function FullSchedule() {
  const { data } = useScheduling()
  const [hidePast, setHidePast] = useState(false)
  const dragRef = useRef<DragPayload | null>(null)
  const currentRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)

  const startDate = useMemo(
    () => monday(d(data.settings.startWeek) || clinicToday()),
    [data.settings.startWeek]
  )
  const numWeeks = +data.settings.calWeeks || 26

  // Which row of the list is "now" — used to auto-open it, to scroll to it, and
  // to decide what counts as a past week.
  const currentWeekIdx = useMemo(() => {
    const todayMon = monday(clinicToday())
    let idx = 0
    for (let i = 0; i < numWeeks; i++) {
      const ws = addDays(startDate, i * 7)
      if (ws.getTime() === todayMon.getTime()) return i
      if (ws <= todayMon) idx = i
    }
    return idx
  }, [startDate, numWeeks])

  const [open, setOpen] = useState<Record<number, boolean>>({ [currentWeekIdx]: true })
  useEffect(() => { setOpen((o) => ({ ...o, [currentWeekIdx]: true })) }, [currentWeekIdx])

  const jump = (which: "current" | "next") => {
    const el = which === "next" ? nextRef.current : currentRef.current
    if (!el) return
    const idx = which === "next" ? currentWeekIdx + 1 : currentWeekIdx
    setHidePast(false)
    setOpen((o) => ({ ...o, [idx]: true }))
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    // Only on first mount — re-scrolling on every edit would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <div className="callout">
        Full weekly schedule showing <strong>providers</strong>, <strong>interns</strong> and{" "}
        <strong>XRTs</strong> at each clinic from the A/B rotation plus assignments. PTO and coverage changes
        are reflected automatically. <strong>Drag</strong> a chip to move a provider, hover to{" "}
        <strong>remove</strong> them, click <strong>+ note</strong> to annotate a cell, and drag onto the{" "}
        <strong>OFF</strong> row to log time off.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }} className="no-print">
        <button className="btn-add" style={{ margin: 0 }} onClick={() => setHidePast((h) => !h)}>
          {hidePast ? "Show All Weeks" : "Hide Past Weeks"}
        </button>
        <button
          className="btn-add"
          style={{ margin: 0, background: "var(--surface)", color: "var(--ink)", borderColor: "var(--border)" }}
          onClick={() => jump("current")}
        >
          Jump to Current Week
        </button>
        <button
          className="btn-add"
          style={{ margin: 0, background: "var(--surface)", color: "var(--ink)", borderColor: "var(--border)" }}
          onClick={() => jump("next")}
        >
          Jump to Next Week
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        {Array.from({ length: numWeeks }).map((_, wi) => {
          const isPast = wi < currentWeekIdx
          if (hidePast && isPast) return null
          const isCurrent = wi === currentWeekIdx
          const isNext = wi === currentWeekIdx + 1
          return (
            <WeekCard
              key={wi}
              wi={wi}
              weekStart={addDays(startDate, wi * 7)}
              isCurrent={isCurrent}
              isOpen={!!open[wi]}
              onToggle={() => setOpen((o) => ({ ...o, [wi]: !o[wi] }))}
              dragRef={dragRef}
              cardRef={isCurrent ? currentRef : isNext ? nextRef : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

function WeekCard({
  wi, weekStart, isCurrent, isOpen, onToggle, dragRef, cardRef,
}: {
  wi: number
  weekStart: Date
  isCurrent: boolean
  isOpen: boolean
  onToggle: () => void
  dragRef: React.MutableRefObject<DragPayload | null>
  cardRef?: React.RefObject<HTMLDivElement>
}) {
  const { data, ephemeral, update } = useScheduling()
  const toast = usePlannerToast()

  const wType = weekType(weekStart, data.settings.startWeek)
  const sched = wType === "A" ? data.scheduleA : data.scheduleB
  const weekEnd = addDays(weekStart, 4)
  const wKey = ymd(weekStart)

  const interns = useMemo(() => getActiveInterns(data, weekStart), [data, weekStart])
  const xrts = useMemo(() => getActiveXRTs(data, weekStart), [data, weekStart])

  // --- editing ---------------------------------------------------------------

  const moveProvider = (from: DragPayload, toClinic: string, toDay: DayName) => {
    if (from.clinic === toClinic && from.day === toDay) return
    if (from.wtype !== wType) { toast("Can't move between A and B weeks", "warn"); return }
    update((dd) => {
      const s = from.wtype === "A" ? dd.scheduleA : dd.scheduleB
      if (s[from.clinic]?.[from.day]) {
        s[from.clinic][from.day] = s[from.clinic][from.day]!.filter((i) => i !== from.init)
      }
      if (!s[toClinic]) s[toClinic] = {}
      if (!s[toClinic][toDay]) s[toClinic][toDay] = []
      if (!s[toClinic][toDay]!.includes(from.init)) s[toClinic][toDay]!.push(from.init)
    })
    toast(`Moved ${from.init}: ${from.clinic} ${from.day} → ${toClinic} ${toDay}`, "success")
  }

  const dropOnOff = (from: DragPayload, date: Date) => {
    if (from.wtype !== wType) { toast("Can't move between A and B weeks", "warn"); return }
    const ds = ymd(date)
    if (data.scheduleOverrides.some((e) => e.init === from.init && e.date === ds && e.action === "out-all")) {
      toast(`${from.init} is already off on ${ds}`, "warn"); return
    }
    if (isOnPTO(from.init, date, data.ptoEntries, data.recurringRules)) {
      toast(`${from.init} already has PTO on ${ds}`, "warn"); return
    }
    const reason = window.prompt(`Reason for ${from.init} being off on ${ds}:\n(e.g. PTO, CME, Personal, Sick)`, "PTO")
    if (reason === null) return
    const note = reason.trim() || "Off"
    update((dd) => { dd.scheduleOverrides.push({ date: ds, init: from.init, action: "out-all", clinic: "", note }) })
    toast(`${from.init} marked OFF on ${ds} (${note})`, "success")
  }

  const removeProvider = async (init: string, clinic: string, day: DayName) => {
    if (!(await confirmDialog(`Remove ${init} from ${clinic} on ${day} (${wType} week)?`))) return
    update((dd) => {
      const s = wType === "A" ? dd.scheduleA : dd.scheduleB
      if (s[clinic]?.[day]) s[clinic][day] = s[clinic][day]!.filter((i) => i !== init)
    })
    toast(`Removed ${init} from ${clinic} ${day}`, "success")
  }

  // Cell notes are per clinic-day-weektype, so they repeat with the rotation
  // rather than belonging to one calendar week — same as the prototype.
  const editNote = (clinic: string, day: DayName) => {
    const key = `${clinic}-${day}-${wType}`
    const val = window.prompt(`Cell note for ${clinic} ${day} (${wType} week):`, data.msNotes[key] || "")
    if (val === null) return
    update((dd) => {
      if (val.trim()) dd.msNotes[key] = val.trim()
      else delete dd.msNotes[key]
    })
  }

  const onCall: OnCallWeek = data.onCallPASchedule[wKey] || {}
  const setOnCallAll = (val: string) =>
    update((dd) => { dd.onCallPASchedule[wKey] = Object.fromEntries(DAYS.map((x) => [x, val])) as OnCallWeek })
  const setOnCallDay = (day: DayName, val: string) =>
    update((dd) => { dd.onCallPASchedule[wKey] = { ...(dd.onCallPASchedule[wKey] || {}), [day]: val } })

  // --- rendering -------------------------------------------------------------

  let gapCount = 0
  let overCount = 0
  let underCount = 0
  let surgSep = false
  const rows: React.ReactNode[] = []

  for (const code of data.clinicOrder) {
    const meta = data.clinicMeta[code]
    if (!meta) continue
    const s = sched[code] || {}
    const isSurg = !!meta.isSurgery
    if (isSurg && !surgSep) {
      surgSep = true
      rows.push(<SectionRow key="surgsep" colSpan={DAYS.length + 1}>🏥 Surgery Locations</SectionRow>)
    }

    rows.push(
      <tr key={code}>
        <td className="cal-clinic-label" style={isSurg ? { background: "#fef2f2" } : undefined}>
          {meta.full}
          {isSurg && <span style={{ background: "#991b1b", color: "#fff", fontSize: ".58rem", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>SURGERY</span>}{" "}
          <span className="badge-contract">{code}</span>
        </td>
        {DAYS.map((day, di) => {
          const date = addDays(weekStart, di)
          const base: string[] = (s as any)[day] || []
          const active: string[] = []
          const onPTO: string[] = []
          const onOut: string[] = []

          for (const init of base) {
            const p = data.providers.find((pr) => pr.init === init)
            if (p && !providerActive(p, weekStart)) continue
            if (isOnPTO(init, date, data.ptoEntries, data.recurringRules)) { onPTO.push(init); continue }
            if (isOutOverride(init, date, code, data.scheduleOverrides, data.recurringRules)) { onOut.push(init); continue }
            active.push(init)
          }
          const covers = getCoverOverrides(date, code, data.scheduleOverrides)
          const scheduledCount = base.filter((init) => {
            const p = data.providers.find((pr) => pr.init === init)
            return !p || providerActive(p, weekStart)
          }).length
          const allActive = active.length + covers.length
          const hasGap = scheduledCount > 0 && allActive === 0 && onPTO.length + onOut.length > 0
          if (hasGap) gapCount++
          const isEmpty = scheduledCount === 0 && covers.length === 0

          // Interns and XRTs only run Mon–Fri.
          const internChips: React.ReactNode[] = []
          const xrtChips: React.ReactNode[] = []
          let staffCount = 0
          if (di < 5) {
            for (const intern of interns) {
              if (ephemeral.iaAssignments[`${intern.key}-${di}`] !== code) continue
              const pto = isOnPTO(intern.init, date, data.ptoEntries, data.recurringRules)
                || isOnPTO(intern.key, date, data.ptoEntries, data.recurringRules)
              internChips.push(
                <span key={intern.key} className={"provider-chip intern" + (pto ? " on-pto" : "")} title={intern.name}>
                  {intern.init}
                </span>
              )
              if (!pto) staffCount++
            }
            for (const xrt of xrts) {
              if (data.xrtAssignments[`${xrt.key}-${di}`] !== code) continue
              const pto = isOnPTO(xrt.init, date, data.ptoEntries, data.recurringRules)
                || isOnPTO(xrt.key, date, data.ptoEntries, data.recurringRules)
              xrtChips.push(
                <span key={xrt.key} className={"provider-chip xrt" + (pto ? " on-pto" : "")} title={`${xrt.name} (XR Tech)`}>
                  {xrt.init}
                </span>
              )
              if (!pto) staffCount++
            }
          }

          // Over/under is only meaningful where a clinic is actually running.
          let staffBadge: React.ReactNode = null
          if (!isSurg && di < 5 && allActive > 0) {
            const vol = ephemeral.iaVolumes[`${code}-${di}`] || 0
            const need = getStaffingRequirement(vol, data.staffingRules, data.staffingRulesExtra).totalStaff
            if (need > 0 && staffCount > 0) {
              const diff = staffCount - need
              if (diff > 0) {
                overCount++
                staffBadge = <div className="ms-staff-badge over" title={`Overstaffed: ${staffCount} assigned, ${need} needed`}>+{diff} over</div>
              } else if (diff < 0) {
                underCount++
                staffBadge = <div className="ms-staff-badge under" title={`Understaffed: ${staffCount} assigned, ${need} needed`}>{diff} under</div>
              }
            }
          }

          const cellBg = hasGap ? "#fff0f0"
            : isSurg ? (isEmpty ? "#fef2f2" : "#fce4e4")
            : isEmpty && !internChips.length && !xrtChips.length ? "#fafafa" : ""
          const noteKey = `${code}-${day}-${wType}`
          const noteVal = data.msNotes[noteKey] || ""

          return (
            <td
              key={day}
              className="ms-drop-cell"
              style={cellBg ? { background: cellBg } : undefined}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over") }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove("drag-over")
                const from = dragRef.current
                dragRef.current = null
                if (from) moveProvider(from, code, day)
              }}
            >
              {active.map((init) => (
                <span className="ms-chip-wrap" key={init}>
                  <ProvChip
                    init={init}
                    providers={data.providers}
                    lateStart={getLateStart(init, date, code, data.scheduleOverrides)}
                    draggable
                    dragProps={{
                      onDragStart: (e) => {
                        dragRef.current = { init, clinic: code, day, wtype: wType }
                        e.dataTransfer.effectAllowed = "move"
                      },
                    }}
                  />
                  <button className="ms-chip-x" title="Remove" onClick={() => void removeProvider(init, code, day)}>×</button>
                </span>
              ))}
              {onPTO.map((init) => <ProvChip key={"pto" + init} init={init} providers={data.providers} modClass="on-pto" title="PTO" />)}
              {onOut.map((init) => <ProvChip key={"out" + init} init={init} providers={data.providers} modClass="on-out" title="Out" />)}
              {covers.map((c) => (
                <ProvChip key={"cov" + c.init} init={c.init} providers={data.providers} modClass="on-cover" title={"Covering" + (c.note ? " — " + c.note : "")} />
              ))}
              {(active.length || onPTO.length || onOut.length || covers.length) && (internChips.length || xrtChips.length) ? (
                <div style={{ borderTop: "1px dashed var(--border)", margin: "2px 0", paddingTop: 1 }} />
              ) : null}
              {internChips}
              {xrtChips}
              {staffBadge}
              {noteVal && <div className="ms-note" title={noteVal} onClick={() => editNote(code, day)}>{noteVal}</div>}
              <div className="ms-add-note" onClick={() => editNote(code, day)}>{noteVal ? "" : "+ note"}</div>
            </td>
          )
        })}
      </tr>
    )
  }

  if (data.dailyTasks.length) {
    rows.push(<SectionRow key="tasksep" colSpan={DAYS.length + 1}>📋 Task Assignments</SectionRow>)
    data.dailyTasks.forEach((task, ti) => {
      if (!task.name) return
      rows.push(
        <tr key={"task" + ti}>
          <td className="cal-clinic-label" style={{ background: "#f9f5ff", color: "#6b4c9a", fontSize: ".78rem" }}>
            {task.name}
          </td>
          {DAYS.map((day) => (
            <td key={day} style={{ verticalAlign: "middle", padding: 2 }}>
              {day === "SAT"
                ? <span style={{ color: "var(--ink-faint)", fontSize: ".72rem" }}>—</span>
                : <TaskPicker taskIdx={ti} day={day} />}
            </td>
          ))}
        </tr>
      )
    })
  }

  rows.push(
    <tr key="oncall">
      <td className="cal-clinic-label" style={{ background: "#fff5f5", color: "#991b1b", fontSize: ".78rem" }}>
        🚨 On-Call PA
        <div style={{ marginTop: 3 }}>
          <select
            style={{ width: 120, fontSize: ".68rem", padding: "2px 4px", color: "#991b1b" }}
            value=""
            onChange={(e) => { if (e.target.value) setOnCallAll(e.target.value) }}
          >
            <option value="">Set all →</option>
            {data.providers.map((p) => <option key={p.init} value={p.init}>{p.init}</option>)}
          </select>
        </div>
      </td>
      {DAYS.map((day) => {
        const val = onCall[day] || ""
        return (
          <td key={day} style={{ background: "#fff5f5", padding: 2 }}>
            <select
              style={{
                width: "100%", fontSize: ".76rem", padding: "3px 4px",
                border: `1px solid ${val ? "#fca5a5" : "var(--border)"}`, borderRadius: 4,
                fontWeight: val ? 600 : 400, color: val ? "#991b1b" : "var(--ink-faint)",
                background: val ? "#fff5f5" : "var(--surface)",
              }}
              value={val}
              onChange={(e) => setOnCallDay(day, e.target.value)}
            >
              <option value="">—</option>
              {data.providers.map((p) => <option key={p.init} value={p.init}>{p.init}</option>)}
            </select>
          </td>
        )
      })}
    </tr>
  )

  rows.push(
    <tr key="off">
      <td className="cal-clinic-label" style={{ background: "var(--surface-alt)", color: "var(--ink-faint)", fontSize: 13 }}>
        OFF
      </td>
      {DAYS.map((day, di) => {
        const date = addDays(weekStart, di)
        const ds = ymd(date)
        const chips: React.ReactNode[] = []

        for (const p of data.providers) {
          if (!providerActive(p, weekStart)) continue
          if (isOnPTO(p.init, date, data.ptoEntries, data.recurringRules)) {
            // PTO and recurring rules are managed elsewhere, so they show without a ×.
            const fromRule = !data.ptoEntries.some((e) => e.person === p.init)
            chips.push(<OffChip key={p.init} init={p.init} reason={fromRule ? "Recurring" : "PTO"} />)
            continue
          }
          const ovIdx = data.scheduleOverrides.findIndex(
            (e) => e.init === p.init && e.date === ds && e.action === "out-all"
          )
          if (ovIdx >= 0) {
            const ov = data.scheduleOverrides[ovIdx]
            chips.push(
              <OffChip
                key={p.init}
                init={p.init}
                reason={ov.note || "Out"}
                onRemove={async () => {
                  if (!(await confirmDialog(`Remove ${p.init}'s day off on ${ds}?`))) return
                  update((dd) => { dd.scheduleOverrides.splice(ovIdx, 1) })
                  toast("Removed the day off", "success")
                }}
              />
            )
            continue
          }
          if (data.recurringRules.some((r) => r.person === p.init && r.action === "out-all" && isRecurringRuleMatch(r, date))) {
            chips.push(<OffChip key={p.init} init={p.init} reason="Recurring" />)
          }
        }

        return (
          <td
            key={day}
            className="ms-drop-cell"
            style={{ background: "var(--surface-alt)" }}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over") }}
            onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove("drag-over")
              const from = dragRef.current
              dragRef.current = null
              if (from) dropOnOff(from, date)
            }}
          >
            {chips}
          </td>
        )
      })}
    </tr>
  )

  return (
    <div className="cal-week-card" ref={cardRef}>
      <div className="cal-week-header" style={isCurrent ? { background: "var(--navy)" } : undefined} onClick={onToggle}>
        <span className="week-label">
          {fmtShort(weekStart)} → {fmtShort(weekEnd)}
          {isCurrent && (
            <span style={{ background: "#f5a623", color: "var(--ink)", fontSize: ".6rem", padding: "1px 6px", borderRadius: 3, marginLeft: 6, fontWeight: 700, verticalAlign: "middle" }}>
              CURRENT
            </span>
          )}
        </span>
        <span className="week-meta">
          <span className={"week-badge " + (wType === "A" ? "wk-a" : "wk-b")}>{wType} WEEK</span>
          <span style={{ color: "#ffa" }}>{gapCount > 0 ? `${gapCount} gap${gapCount > 1 ? "s" : ""}` : "✓"}</span>
          {(overCount > 0 || underCount > 0) && (
            <span style={{ fontSize: ".7rem" }}>
              {overCount > 0 && <span style={{ color: "#fcd34d" }}>▲{overCount} over </span>}
              {underCount > 0 && <span style={{ color: "#fca5a5" }}>▼{underCount} under</span>}
            </span>
          )}
          <span style={{ opacity: 0.6 }}>{isOpen ? "▲ collapse" : "▼ expand"}</span>
        </span>
      </div>
      {isOpen && (
        <div className="cal-week-body open">
          <table className="cal-grid">
            <thead>
              <tr>
                <th>CLINIC</th>
                {DAYS.map((day, di) => {
                  const dt = addDays(weekStart, di)
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
            <tbody>{rows}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OffChip({ init, reason, onRemove }: { init: string; reason: string; onRemove?: () => void }) {
  const { data } = useScheduling()
  return (
    <span className="ms-chip-wrap">
      <ProvChip init={init} providers={data.providers} modClass="on-pto" title={reason} />
      <span style={{ fontSize: 8, display: "block", textAlign: "center", opacity: 0.8, marginTop: -1 }}>{reason}</span>
      {onRemove && <button className="ms-chip-x" title="Remove" onClick={onRemove}>×</button>}
    </span>
  )
}
