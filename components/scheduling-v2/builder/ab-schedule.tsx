"use client"

import { useState } from "react"
import { useScheduling } from "../store"
import { SubTabs, SectionRow } from "../shared"
import { usePlannerToast } from "../toast"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { DAYS } from "@/lib/scheduling/constants"
import type { WeekSchedule } from "@/lib/scheduling/types"

// Schedule Builder → Provider A/B (renderSchedule + renderPendingSchedule).
//
// The rotation itself, edited as free text: a cell is a comma-separated list of
// initials. It stays text on purpose — this is the one screen where someone
// rewrites a whole week quickly, and a chip picker would slow that to a crawl.

export default function ABSchedule() {
  const [tab, setTab] = useState("current")
  return (
    <div>
      <SubTabs
        tabs={[
          { key: "current", label: "Current A/B Schedule" },
          { key: "pending", label: "New/Pending Schedule" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "current" ? <CurrentSchedule /> : <PendingSchedule />}
    </div>
  )
}

function CurrentSchedule() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const [week, setWeek] = useState<"A" | "B">("A")
  const sched = week === "A" ? data.scheduleA : data.scheduleB

  const setCell = (code: string, day: string, raw: string) =>
    update((dd) => {
      const s = week === "A" ? dd.scheduleA : dd.scheduleB
      if (!s[code]) s[code] = {}
      const v = raw.trim()
      ;(s[code] as any)[day] = v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []
    })

  const copyAtoB = async () => {
    if (!(await confirmDialog("Overwrite the entire B week with a copy of the A week?"))) return
    update((dd) => {
      for (const c of dd.clinicOrder) {
        if (!dd.scheduleA[c]) continue
        dd.scheduleB[c] = {}
        for (const day of DAYS) (dd.scheduleB[c] as any)[day] = [...((dd.scheduleA[c] as any)[day] || [])]
      }
    })
    toast("Copied the A week over the B week", "success")
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="callout-blue">
        Each cell is a comma-separated list of provider initials. The <strong>A</strong> and <strong>B</strong>{" "}
        weeks alternate from the anchor date in Settings.
      </div>

      <div className="sched-controls">
        <button className={"btn-week" + (week === "A" ? " active" : "")} onClick={() => setWeek("A")}>A Week</button>
        <button className={"btn-week" + (week === "B" ? " active" : "")} onClick={() => setWeek("B")}>B Week</button>
        <span style={{ color: "var(--ink-faint)", fontSize: ".79rem" }}>|</span>
        <button className="btn-print" onClick={() => printSchedule(data, week)}>Print Schedule</button>
        <button className="btn-add" style={{ margin: 0 }} onClick={() => void copyAtoB()}>Copy A → B</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <ScheduleGrid
          title={`${week} WEEK`}
          sched={sched}
          onCell={setCell}
          highlightHighVolume
          idPrefix="sched"
        />
      </div>

      <Summary sched={sched} week={week} />
    </div>
  )
}

function PendingSchedule() {
  const { data, update } = useScheduling()
  const toast = usePlannerToast()
  const [week, setWeek] = useState<"A" | "B">("A")

  // Seeding from the live schedule is what makes the pending tab usable at all —
  // a new rotation is nearly always an edit of the current one.
  const seed = () =>
    update((dd) => {
      dd.pendingScheduleA = {}
      dd.pendingScheduleB = {}
      for (const c of dd.clinicOrder) {
        dd.pendingScheduleA[c] = {}
        dd.pendingScheduleB[c] = {}
        for (const day of DAYS) {
          (dd.pendingScheduleA[c] as any)[day] = [...((dd.scheduleA[c] as any)?.[day] || [])]
          ;(dd.pendingScheduleB[c] as any)[day] = [...((dd.scheduleB[c] as any)?.[day] || [])]
        }
      }
    })

  const pending = week === "A" ? data.pendingScheduleA : data.pendingScheduleB

  const setCell = (code: string, day: string, raw: string) =>
    update((dd) => {
      const s = week === "A" ? dd.pendingScheduleA : dd.pendingScheduleB
      if (!s) return
      if (!s[code]) s[code] = {}
      const v = raw.trim()
      ;(s[code] as any)[day] = v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []
    })

  const activate = async () => {
    if (!data.pendingScheduleStartDate) { toast("Please set a start date first.", "warn"); return }
    if (!(await confirmDialog(
      `Activate the pending schedule? This replaces the current A/B schedule from ${data.pendingScheduleStartDate}.`
    ))) return
    update((dd) => {
      for (const c of dd.clinicOrder) {
        dd.scheduleA[c] = {}
        dd.scheduleB[c] = {}
        for (const day of DAYS) {
          (dd.scheduleA[c] as any)[day] = [...((dd.pendingScheduleA?.[c] as any)?.[day] || [])]
          ;(dd.scheduleB[c] as any)[day] = [...((dd.pendingScheduleB?.[c] as any)?.[day] || [])]
        }
      }
      dd.pendingScheduleA = null
      dd.pendingScheduleB = null
      dd.pendingScheduleStartDate = ""
    })
    toast("Pending schedule activated — the A/B schedule has been replaced", "success")
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="callout" style={{ borderLeftColor: "#6366f1", background: "#f0f0ff", color: "var(--ink)" }}>
        <strong>New schedule preview.</strong> Set the date the new rotation takes effect, edit it below, then
        activate it to replace the current A/B schedule.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <label className="sm-label">Start Date</label>
          <input
            type="date" style={{ width: 160 }} value={data.pendingScheduleStartDate}
            onChange={(e) => update((dd) => { dd.pendingScheduleStartDate = e.target.value })}
          />
        </div>
        <div className="sched-controls" style={{ marginBottom: 0 }}>
          <button className={"btn-week" + (week === "A" ? " active" : "")} onClick={() => setWeek("A")}>A Week</button>
          <button className={"btn-week" + (week === "B" ? " active" : "")} onClick={() => setWeek("B")}>B Week</button>
          <button className="btn-add" style={{ margin: 0 }} onClick={seed}>Copy Current → Pending</button>
          <button
            className="btn-add"
            style={{ margin: 0, background: "#6366f1", color: "#fff", borderColor: "#6366f1" }}
            onClick={() => void activate()}
          >
            ✓ Activate Pending Schedule
          </button>
        </div>
      </div>

      {!pending ? (
        <p className="empty-state">
          No pending schedule yet — use <strong>Copy Current → Pending</strong> to start from the live rotation.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <ScheduleGrid title={`PENDING ${week} WEEK`} sched={pending} onCell={setCell} idPrefix="pend" pending />
        </div>
      )}
    </div>
  )
}

function ScheduleGrid({
  title, sched, onCell, highlightHighVolume, idPrefix, pending,
}: {
  title: string
  sched: WeekSchedule
  onCell: (code: string, day: string, raw: string) => void
  highlightHighVolume?: boolean
  idPrefix: string
  pending?: boolean
}) {
  const { data } = useScheduling()
  let surgSep = false

  const rows: React.ReactNode[] = []
  for (const code of data.clinicOrder) {
    const meta = data.clinicMeta[code]
    if (!meta) continue
    const s = sched[code] || {}
    const isSurg = !!meta.isSurgery
    let used = 0

    if (isSurg && !surgSep) {
      surgSep = true
      rows.push(<SectionRow key="surgsep" colSpan={DAYS.length + 2}>🏥 Surgery Locations</SectionRow>)
    }

    rows.push(
      <tr key={code}>
        <td className="clinic-label" style={isSurg ? { background: "#fef2f2" } : undefined}>
          {meta.full}
          {isSurg && <span style={{ background: "#991b1b", color: "#fff", fontSize: ".58rem", padding: "1px 5px", borderRadius: 3, marginLeft: 4 }}>SURGERY</span>}
          <span className="contract-note">{code}</span>
        </td>
        {DAYS.map((day) => {
          const provs = (s as any)[day] || []
          if (provs.length) used++
          const hasHigh = highlightHighVolume && provs.some((init: string) => {
            const p = data.providers.find((pr) => pr.init === init)
            return p && p.ptsDay > 30
          })
          const bg = provs.length === 0
            ? (isSurg ? "#fef8f8" : "#fafafa")
            : pending ? (isSurg ? "#fce4e4" : "#f0f0ff")
            : hasHigh ? "#fff8e1" : (isSurg ? "#fce8e8" : "#f0fff4")
          return (
            <td key={day} style={{ background: bg }}>
              <div className="sched-cell">
                <input
                  type="text"
                  className={provs.length ? undefined : "empty"}
                  defaultValue={provs.join(", ")}
                  key={`${idPrefix}-${code}-${day}-${provs.join(",")}`}
                  onBlur={(e) => onCell(code, day, e.target.value)}
                />
                {provs.length > 1 && <div className="sched-provider-count">{provs.length}</div>}
              </div>
            </td>
          )
        })}
        <td style={{ textAlign: "center", fontWeight: 700, fontSize: ".84rem" }}>{used}</td>
      </tr>
    )
  }

  return (
    <table className="sched-grid">
      <thead>
        <tr>
          <th>{title}</th>
          {DAYS.map((day) => <th key={day}>{day}</th>)}
          <th style={{ width: 65 }}>Days</th>
        </tr>
      </thead>
      <tbody>
        {rows}
        <tr style={{ background: "var(--surface-alt)", fontWeight: 600 }}>
          <td style={{ padding: 8 }}>TOTAL</td>
          {DAYS.map((day) => {
            let t = 0
            for (const c of data.clinicOrder) t += ((sched[c] as any)?.[day] || []).length
            return <td key={day} style={{ textAlign: "center", padding: 8 }}>{t}</td>
          })}
          <td />
        </tr>
      </tbody>
    </table>
  )
}

/**
 * Days-per-provider against their contracted days, plus anyone double-booked.
 * A conflict here is invisible on the grid itself — two clinics, two cells — so
 * it gets its own panel.
 */
function Summary({ sched, week }: { sched: WeekSchedule; week: "A" | "B" }) {
  const { data } = useScheduling()

  const provDays: Record<string, number> = {}
  for (const code of data.clinicOrder) {
    for (const day of DAYS) {
      for (const init of ((sched[code] as any)?.[day] || [])) provDays[init] = (provDays[init] || 0) + 1
    }
  }

  const conflicts: { init: string; day: string; clinics: string[] }[] = []
  for (const day of DAYS) {
    const perProvider: Record<string, string[]> = {}
    for (const c of data.clinicOrder) {
      for (const init of ((sched[c] as any)?.[day] || [])) (perProvider[init] ||= []).push(c)
    }
    for (const [init, clinics] of Object.entries(perProvider)) {
      if (clinics.length > 1) conflicts.push({ init, day, clinics })
    }
  }

  return (
    <div className="sched-summary">
      <div className="sched-summary-card" style={{ flex: 1 }}>
        <h4>Provider Days — {week} Week</h4>
        {Object.entries(provDays).sort((a, b) => b[1] - a[1]).map(([init, count]) => {
          const p = data.providers.find((pr) => pr.init === init)
          const exp = p ? p.clinicDays : null
          const col = exp == null ? "var(--ink-muted)"
            : count > exp ? "var(--danger)" : count < exp ? "var(--flag)" : "var(--good)"
          return (
            <div className="prov-sched-row" key={init}>
              <span>{p ? p.name : init} <span style={{ color: "var(--ink-faint)" }}>({init})</span></span>
              <span style={{ fontWeight: 600, color: col }}>{count}d / {exp ?? "?"}d</span>
            </div>
          )
        })}
      </div>
      {conflicts.length > 0 && (
        <div className="sched-summary-card" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}>
          <h4 style={{ color: "var(--danger)" }}>Conflicts</h4>
          {conflicts.map((c, i) => {
            const p = data.providers.find((pr) => pr.init === c.init)
            return (
              <div key={i} style={{ fontSize: ".79rem", color: "var(--danger)", padding: "2px 0" }}>
                <strong>{p ? p.name : c.init}</strong> double-booked {c.day}:{" "}
                {c.clinics.map((x) => data.clinicMeta[x]?.full ?? x).join(" & ")}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Opens the printable one-week grid the dashboard's printSchedule() produced. */
function printSchedule(data: ReturnType<typeof useScheduling>["data"], week: "A" | "B") {
  const sched = week === "A" ? data.scheduleA : data.scheduleB
  const w = window.open("", "_blank", "width=1100,height=800")
  if (!w) return
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))

  const bodyRows = data.clinicOrder.map((code) => {
    const meta = data.clinicMeta[code]
    if (!meta) return ""
    const cells = DAYS.map((day) => {
      const provs = ((sched[code] as any)?.[day] || []) as string[]
      return `<td style="background:${provs.length ? "#fff" : "#f8f8f8"}">${esc(provs.join(", ")) || "—"}</td>`
    }).join("")
    return `<tr><td class="cn">${esc(meta.full)} <span style="font-weight:400;font-size:.68rem;color:#888">(${esc(code)})</span></td>${cells}</tr>`
  }).join("")

  const totals = DAYS.map((day) => {
    let t = 0
    for (const c of data.clinicOrder) t += ((sched[c] as any)?.[day] || []).length
    return `<td>${t}</td>`
  }).join("")

  w.document.write(`<!DOCTYPE html><html><head><title>${week} Week Provider Schedule</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;padding:20px;color:#333}
h1{font-size:1.1rem;margin-bottom:3px}.sub{font-size:.78rem;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:.78rem}
th{background:#0C3B5D;color:#fff;padding:6px 8px;text-align:center;border:1px solid #333;font-size:.68rem;text-transform:uppercase}
th:first-child{text-align:left}td{border:1px solid #ccc;padding:5px 7px;text-align:center}
.cn{background:#f0f0f0;font-weight:700;text-align:left}.tr{background:#e8e8e8;font-weight:700}
@media print{body{padding:8px}}</style></head><body>
<h1>Genesis Ortho — ${week} Week Provider Schedule</h1>
<div class="sub">Printed ${new Date().toLocaleDateString()}</div>
<table><thead><tr><th>CLINIC</th>${DAYS.map((d) => `<th>${d}</th>`).join("")}</tr></thead>
<tbody>${bodyRows}<tr class="tr"><td>TOTAL</td>${totals}</tr></tbody></table></body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 300)
}
