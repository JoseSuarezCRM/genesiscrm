"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { ProvChip } from "@/components/scheduling-v2/shared"
import { DAYS } from "@/lib/scheduling/constants"
import { toISODate, fmtShort } from "@/lib/scheduling/dates"
import { getProvColor, chipTextColor } from "@/lib/scheduling/providers"
import { runOptimizer, isLocked, type OptimizerResult } from "@/lib/scheduling/optimizer"

const WD = DAYS.filter((x) => x !== "SAT")

export default function Optimizer() {
  const { data, update } = useScheduling()
  const [lockWeek, setLockWeek] = useState<"A" | "B">("A")
  const [ruleType, setRuleType] = useState("unique-clinics")
  const [ruleTarget, setRuleTarget] = useState("_all_")
  const [ruleExtra, setRuleExtra] = useState(1)
  const [ruleClinic, setRuleClinic] = useState(data.clinicOrder.find((c) => !data.clinicMeta[c]?.isSurgery) || "")
  const [targetDate, setTargetDate] = useState(toISODate(new Date()))
  const [result, setResult] = useState<OptimizerResult | null>(null)

  const sched = lockWeek === "A" ? data.scheduleA : data.scheduleB

  const toggleLock = (init: string, clinic: string, day: string) =>
    update((dd) => {
      const idx = dd.scheduleLocks.findIndex((l) => l.init === init && l.clinic === clinic && l.day === day && (l.week === lockWeek || l.week === "both"))
      if (idx >= 0) dd.scheduleLocks.splice(idx, 1)
      else {
        const otherWk = lockWeek === "A" ? "B" : "A"
        const oi = dd.scheduleLocks.findIndex((l) => l.init === init && l.clinic === clinic && l.day === day && l.week === otherWk)
        if (oi >= 0) dd.scheduleLocks[oi].week = "both"
        else dd.scheduleLocks.push({ init, clinic, day: day as any, week: lockWeek })
      }
    })

  const lockAll = () => update((dd) => {
    const s = lockWeek === "A" ? dd.scheduleA : dd.scheduleB
    for (const code of dd.clinicOrder) for (const day of DAYS) (s[code]?.[day] || []).forEach((init) => {
      if (!isLocked(dd.scheduleLocks, init, code, day, lockWeek)) {
        const otherWk = lockWeek === "A" ? "B" : "A"
        const oi = dd.scheduleLocks.findIndex((l) => l.init === init && l.clinic === code && l.day === day && l.week === otherWk)
        if (oi >= 0) dd.scheduleLocks[oi].week = "both"
        else dd.scheduleLocks.push({ init, clinic: code, day: day as any, week: lockWeek })
      }
    })
  })
  const unlockAll = () => update((dd) => {
    dd.scheduleLocks = dd.scheduleLocks.filter((l) => {
      if (l.week === "both") { l.week = lockWeek === "A" ? "B" : "A"; return true }
      return l.week !== lockWeek
    })
  })

  const addRule = () => {
    const clinic = ruleType === "no-clinic" || ruleType === "single-clinic-only" ? ruleClinic : ""
    if (data.optimizerRules.find((r) => r.type === ruleType && r.target === ruleTarget && r.clinic === clinic)) { alert("This rule already exists"); return }
    update((dd) => { dd.optimizerRules.push({ type: ruleType as any, target: ruleTarget, extra: ruleType === "max-days-at-clinic" ? ruleExtra : 0, clinic }) })
  }

  const run = () => setResult(runOptimizer(data, targetDate))

  const accept = () => {
    if (!result) return
    update((dd) => {
      for (const c of dd.clinicOrder) {
        if (result.proposedA[c]) { dd.scheduleA[c] = {}; for (const day of DAYS) dd.scheduleA[c][day] = [...(result.proposedA[c][day] || [])] }
        if (result.proposedB[c]) { dd.scheduleB[c] = {}; for (const day of DAYS) dd.scheduleB[c][day] = [...(result.proposedB[c][day] || [])] }
      }
    })
    setResult(null)
  }

  const typeLabels: Record<string, string> = { "unique-clinics": "Different clinic each day", "max-days-at-clinic": "Max days/wk at one clinic", "single-clinic-only": "Only at one clinic", "same-region": "Stay in same region", "no-clinic": "Never assign to clinic" }
  const dayNames: Record<string, string> = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday" }

  return (
    <div>
      <h2>AI Schedule Optimizer</h2>
      <div className="callout-blue">Analyzes clinic volume, provider capacity, regions, and your locks to recommend schedule changes — preferring day swaps over clinic changes. Lock any assignment that must stay.</div>

      {/* LOCK GRID */}
      <div className="section" style={{ borderColor: "#c4b5fd", marginBottom: 16 }}>
        <h3 style={{ marginBottom: 6 }}>🔒 Lock Schedule — Click Providers to Freeze</h3>
        <p className="desc-text">Click a chip to lock/unlock. Locked assignments (gold) won&apos;t be changed.</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button className={"btn-week" + (lockWeek === "A" ? " active" : "")} onClick={() => setLockWeek("A")}>A Week</button>
          <button className={"btn-week" + (lockWeek === "B" ? " active" : "")} onClick={() => setLockWeek("B")}>B Week</button>
          <span style={{ color: "#888", fontSize: ".79rem" }}>|</span>
          <button className="btn-add" style={{ margin: 0 }} onClick={lockAll}>🔒 Lock All</button>
          <button className="btn-add" style={{ margin: 0 }} onClick={unlockAll}>🔓 Unlock All</button>
          <span style={{ fontSize: ".75rem", color: "#888", marginLeft: 8 }}>{data.scheduleLocks.length} locked</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="sched-grid" style={{ fontSize: ".78rem" }}>
            <thead><tr><th>{lockWeek} WEEK</th>{DAYS.map((day) => <th key={day}>{day}</th>)}</tr></thead>
            <tbody>
              {data.clinicOrder.map((code) => {
                const meta = data.clinicMeta[code]
                if (!meta) return null
                const s = sched[code] || {}
                if (!DAYS.some((day) => (s[day] || []).length > 0) && !meta.isSurgery) return null
                return (
                  <tr key={code}>
                    <td className="clinic-label" style={{ padding: "5px 8px", fontSize: ".78rem" }}>{meta.full}<span className="contract-note">{code}</span></td>
                    {DAYS.map((day) => (
                      <td key={day} style={{ padding: "4px 5px", textAlign: "center" }}>
                        {(s[day] || []).map((init) => {
                          const col = getProvColor(init, data.providers)
                          const locked = isLocked(data.scheduleLocks, init, code, day, lockWeek)
                          return <span key={init} className={"provider-chip lock-chip" + (locked ? " locked" : "")} style={{ background: col, borderColor: col, color: chipTextColor(col) }} onClick={() => toggleLock(init, code, day)}>{init}</span>
                        })}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RULES */}
      <div className="section" style={{ borderColor: "#fbbf24", marginBottom: 16 }}>
        <h3 style={{ marginBottom: 6 }}>📋 Optimization Rules</h3>
        <div style={{ marginBottom: 10 }}>
          {data.optimizerRules.length === 0 ? <p className="desc-text" style={{ margin: "4px 0" }}>No rules set.</p> : data.optimizerRules.map((rule, i) => {
            const targetLabel = rule.target === "_all_" ? "All providers" : rule.target === "_surgeons_" ? "Surgeons" : data.providers.find((p) => p.init === rule.target)?.name || rule.target
            let extra = ""
            if (rule.type === "max-days-at-clinic") extra = ` (max ${rule.extra})`
            if (rule.type === "single-clinic-only") extra = ` → ${rule.clinic} only`
            if (rule.type === "no-clinic") extra = ` → ${rule.clinic}`
            return <span className="opt-lock" key={i} style={{ background: "#fef9c3", borderColor: "#fbbf24" }}>🔒 <strong>{targetLabel}</strong>: {typeLabels[rule.type]}{extra}<button className="btn-x" onClick={() => update((dd) => { dd.optimizerRules.splice(i, 1) })}>✕</button></span>
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><label className="sm-label">Rule Type</label>
            <select value={ruleType} onChange={(e) => setRuleType(e.target.value)} style={{ width: 220 }}>
              <option value="unique-clinics">Different clinic each day</option>
              <option value="max-days-at-clinic">Max days/week at one clinic</option>
              <option value="single-clinic-only">Only assign to one clinic</option>
              <option value="same-region">Stay in same region all week</option>
              <option value="no-clinic">Never assign to clinic</option>
            </select></div>
          <div><label className="sm-label">Applies To</label>
            <select value={ruleTarget} onChange={(e) => setRuleTarget(e.target.value)} style={{ width: 160 }}>
              <option value="_all_">All Providers</option><option value="_surgeons_">Surgeons Only</option>
              {data.providers.filter((p) => p.init).map((p) => <option key={p.init} value={p.init}>{p.name} ({p.init})</option>)}
            </select></div>
          {ruleType === "max-days-at-clinic" && <div><label className="sm-label">Max Days</label><input type="number" value={ruleExtra} min={1} max={5} style={{ width: 60 }} onChange={(e) => setRuleExtra(+e.target.value)} /></div>}
          {(ruleType === "no-clinic" || ruleType === "single-clinic-only") && <div><label className="sm-label">Clinic</label><select value={ruleClinic} onChange={(e) => setRuleClinic(e.target.value)} style={{ width: 130 }}>{data.clinicOrder.filter((c) => !data.clinicMeta[c]?.isSurgery).map((c) => <option key={c} value={c}>{c}</option>)}</select></div>}
          <button className="btn-add" style={{ margin: 0, height: 32 }} onClick={addRule}>+ Add Rule</button>
        </div>
      </div>

      {/* RUN */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div><label className="sm-label">Target Date</label><input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ width: 160 }} /></div>
        <button className="btn-add" style={{ margin: 0, background: "#8b0000", color: "#fff", borderColor: "#8b0000", padding: "8px 18px", fontSize: ".85rem", fontWeight: 600 }} onClick={run}>⚡ Run Optimizer</button>
      </div>

      {/* RESULTS */}
      {result && <Results result={result} typeLabels={typeLabels} dayNames={dayNames} onAccept={accept} />}
    </div>
  )
}

function Results({ result, dayNames, onAccept }: { result: OptimizerResult; typeLabels: Record<string, string>; dayNames: Record<string, string>; onAccept: () => void }) {
  const { data } = useScheduling()
  const recs = result.recommendations
  const dateLabel = result.targetDateStr ? fmtShort(new Date(result.targetDateStr + "T00:00:00")) : "Today"
  const provList = result.activeProviders.map((p) => p.init).join(", ")

  if (!recs.length) return <div className="opt-card neutral"><h3>✓ Schedule looks well-optimized</h3><p className="desc-text" style={{ margin: "6px 0 0" }}>No significant gaps or overstaffing found as of <strong>{dateLabel}</strong>. Active: {provList}.</p></div>

  const high = recs.filter((r) => r.priority === "high").length
  const med = recs.filter((r) => r.priority === "medium").length
  const low = recs.filter((r) => r.priority === "low").length
  const totalImpact = recs.reduce((s, r) => s + r.impact, 0)

  return (
    <div>
      <div className="callout" style={{ marginBottom: 12 }}><strong>Optimizing for: {dateLabel}</strong> · {result.activeProviders.length} active providers ({provList})</div>
      <div className="opt-summary-grid">
        <div className="opt-summary-card"><div className="val">{recs.length}</div><div className="lbl">Changes</div></div>
        <div className="opt-summary-card"><div className="val" style={{ color: "var(--c-danger)" }}>{high}</div><div className="lbl">High Priority</div></div>
        <div className="opt-summary-card"><div className="val" style={{ color: "var(--c-warning)" }}>{med}</div><div className="lbl">Medium Priority</div></div>
        <div className="opt-summary-card"><div className="val" style={{ color: "var(--c-info)" }}>{low}</div><div className="lbl">Low Priority</div></div>
        <div className="opt-summary-card"><div className="val" style={{ color: "var(--c-success)" }}>+{totalImpact}</div><div className="lbl">Pts/Day Impact</div></div>
      </div>

      <div className="opt-card neutral" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 8 }}>📊 Clinic Coverage Overview</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".79rem" }}>
            <thead><tr><th style={{ textAlign: "left", padding: "5px 8px" }}>Clinic</th><th style={{ padding: "5px 8px" }}>Avg Daily</th><th style={{ padding: "5px 8px" }}>A Cap</th><th style={{ padding: "5px 8px" }}>B Cap</th><th style={{ padding: "5px 8px" }}>Status</th></tr></thead>
            <tbody>
              {result.clinicAnalysis.filter((ca) => ca.avgDaily > 0).map((ca) => {
                const days = DAYS.filter((x) => x !== "SAT")
                const capAvg = (sched: any) => days.reduce((s, day) => s + (sched[ca.code]?.[day] || []).reduce((s2: number, init: string) => { const p = data.providers.find((pr) => pr.init === init); return s2 + (p ? p.ptsDay : 30) }, 0), 0) / days.length
                const aCap = capAvg(data.scheduleA), bCap = capAvg(data.scheduleB)
                const ratio = (aCap + bCap) / 2 > 0 ? ca.avgDaily / ((aCap + bCap) / 2) : 999
                const status = ratio > 1.15 ? <span className="badge-hire">UNDERSTAFFED</span> : ratio < 0.65 ? <span className="badge-over">OVERSTAFFED</span> : <span className="badge-ok">BALANCED</span>
                return <tr key={ca.code}><td style={{ fontWeight: 600, padding: "5px 8px" }}>{ca.code} — {ca.full}</td><td style={{ textAlign: "center", padding: "5px 8px" }}>{ca.avgDaily}</td><td style={{ textAlign: "center", padding: "5px 8px" }}>{Math.round(aCap)}</td><td style={{ textAlign: "center", padding: "5px 8px" }}>{Math.round(bCap)}</td><td style={{ textAlign: "center", padding: "5px 8px" }}>{status}</td></tr>
              })}
            </tbody>
          </table>
        </div>
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: ".85rem", color: "#1a1a2e" }}>📝 Change Log ({recs.length} changes)</summary>
        <div style={{ marginTop: 8 }}>
          {recs.map((rec, i) => {
            let desc = ""
            if (rec.type === "move") desc = `${rec.from} → ${rec.to} on ${dayNames[rec.day!]}`
            else if (rec.type === "add") desc = `Add to ${rec.clinic} on ${dayNames[rec.day!]}`
            else if (rec.type === "remove") desc = `Remove from ${rec.clinic} on ${dayNames[rec.day!]}`
            return <div key={i} style={{ padding: "4px 0", fontSize: ".79rem", borderBottom: "1px solid #f0f0f0" }}><ProvChip init={rec.init} providers={data.providers} /> {rec.ruleFlag && <span className="opt-score" style={{ background: "#fef3c7", color: "#92400e", fontSize: ".62rem" }}>🔒 RULE</span>} → {desc} <span style={{ color: "#888" }}>({rec.week} Wk)</span></div>
          })}
        </div>
      </details>

      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="opt-btn-accept-all" onClick={onAccept}>✓ Accept Optimized Schedule</button>
        <span className="desc-text" style={{ margin: 0 }}>Replaces the current A/B schedule with the proposed version</span>
      </div>
    </div>
  )
}
