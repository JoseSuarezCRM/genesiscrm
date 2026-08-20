"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { DAYS, MONTHS } from "@/lib/scheduling/constants"
import { d, monday, addDays, fmtShort } from "@/lib/scheduling/dates"
import { providerActive } from "@/lib/scheduling/providers"
import { recentAvg } from "@/lib/scheduling/volume"
import { staffRoleGroup } from "@/lib/scheduling/staffing"
import { clinicCalcs } from "@/lib/scheduling/analytics"

export default function Hiring() {
  const { data } = useScheduling()
  const now = new Date()
  const target = +data.settings.targetPts || 30
  const dpm = +data.settings.daysPerMonth || 21
  const orientDays = +data.settings.orientDays || 7
  const calcs = clinicCalcs(data, monday(now), "A")

  const countByRole = (asOf: Date) => {
    const counts = { providers: 0, interns: 0, xrt: 0, fd: 0 }
    const names = { providers: [] as string[], interns: [] as string[], xrt: [] as string[], fd: [] as string[] }
    data.providers.forEach((p) => { if (providerActive(p, asOf)) { counts.providers++; names.providers.push(p.init) } })
    data.currentStaff.forEach((s) => {
      const ld = d(s.lastDay); if (ld && ld < asOf) return
      const g = staffRoleGroup(s.role)
      if (g === "xrt") { counts.xrt++; names.xrt.push(s.init || s.name) }
      else if (g === "fd") { counts.fd++; names.fd.push(s.init || s.name) }
      else { counts.interns++; names.interns.push(s.init || s.name) }
    })
    data.incomingInterns.forEach((s) => { const st = d(s.start); if (!st || st > asOf) return; if (addDays(st, orientDays) > asOf) return; counts.interns++; names.interns.push(s.name.split(" ")[0]) })
    return { counts, names }
  }

  const calcNeeded = () => {
    const needed = { xrt: 0, fd: 0, ma: 0 }
    const clinicNeeds: { code: string; full: string; avgDaily: number; xrt: number; fd: number; ma: number }[] = []
    const sched = data.scheduleA
    for (const code of data.clinicOrder) {
      const meta = data.clinicMeta[code]; if (!meta) continue
      const s = sched[code] || {}
      const avgDaily = Math.round(recentAvg(code, data.rawVolume) / dpm)
      let daysWithProviders = 0
      for (const day of DAYS) if ((s[day] || []).length > 0) daysWithProviders++
      let rule = data.staffingRules.find((r) => avgDaily >= r.minPts && avgDaily <= r.maxPts)
      if (!rule && avgDaily > 0) rule = data.staffingRules[data.staffingRules.length - 1]
      const cNeed = { code, full: meta.full, avgDaily, xrt: 0, fd: 0, ma: 0 }
      if (rule && daysWithProviders > 0) {
        const bd = rule.breakdown.toLowerCase()
        if (bd.includes("xrt")) cNeed.xrt = 1
        const fdMatch = bd.match(/(\d+)\s*fd/); if (fdMatch) cNeed.fd = parseInt(fdMatch[1])
        const maMatch = bd.match(/(\d+)\s*ma/i); if (maMatch) cNeed.ma = parseInt(maMatch[1])
        if (avgDaily > rule.maxPts && rule === data.staffingRules[data.staffingRules.length - 1]) cNeed.ma += Math.floor((avgDaily - rule.minPts) / data.staffingRulesExtra)
      }
      needed.xrt += cNeed.xrt * Math.max(daysWithProviders, 1)
      needed.fd += cNeed.fd * Math.max(daysWithProviders, 1)
      needed.ma += cNeed.ma * Math.max(daysWithProviders, 1)
      clinicNeeds.push(cNeed)
    }
    return { needed, clinicNeeds }
  }

  const { counts: cur, names: curNames } = countByRole(monday(now))
  const { needed, clinicNeeds } = calcNeeded()
  const avgDaysPer = 4.5
  const neededPeople = { xrt: Math.ceil(needed.xrt / avgDaysPer), fd: Math.ceil(needed.fd / avgDaysPer), ma: Math.ceil(needed.ma / avgDaysPer) }
  const overCap = calcs.filter((c) => c.utilization > 110)
  const extraProvDays = overCap.reduce((s, c) => s + Math.ceil((c.avgVol - c.monthlyCapacity) / target / (dpm / 5)), 0)
  const neededProviders = Math.ceil(extraProvDays / 4)

  const totalCurSupport = cur.interns + cur.xrt + cur.fd
  const totalNeededSupport = neededPeople.xrt + neededPeople.fd + neededPeople.ma
  const supportGap = totalNeededSupport - totalCurSupport

  const months = Array.from({ length: 6 }).map((_, m) => new Date(now.getFullYear(), now.getMonth() + m, 1))
  const roles = [{ key: "providers" as const, label: "Providers" }, { key: "interns" as const, label: "MAs/Interns" }, { key: "xrt" as const, label: "XR Techs" }, { key: "fd" as const, label: "Front Desk" }]
  const neededMap: any = { providers: cur.providers + neededProviders, interns: neededPeople.ma, xrt: neededPeople.xrt, fd: neededPeople.fd }

  const recs = buildRecs()
  function buildRecs() {
    const out: { urgency: string; icon: string; title: string; reason: string; action: string }[] = []
    if (neededProviders > 0) out.push({ urgency: "urgent", icon: "🔴", title: `Hire ${neededProviders} Provider${neededProviders > 1 ? "s" : ""}`, reason: `${overCap.length} clinic(s) over 110% (${overCap.map((c) => c.code).join(", ")}).`, action: `Target ~4 days/week each` })
    const futureIncoming = data.incomingInterns.filter((s) => { const st = d(s.start); return st && st > now }).length
    const maGap = neededPeople.ma - cur.interns
    if (maGap - futureIncoming > 0) out.push({ urgency: "urgent", icon: "🔴", title: `Hire ${maGap - futureIncoming} MA/Intern`, reason: `Need ${neededPeople.ma}, have ${cur.interns} + ${futureIncoming} incoming.`, action: "Start recruiting immediately" })
    if (neededPeople.xrt - cur.xrt > 0) out.push({ urgency: "urgent", icon: "🔴", title: `Hire ${neededPeople.xrt - cur.xrt} XR Tech`, reason: `Need ${neededPeople.xrt}, have ${cur.xrt}.`, action: "Post XRT positions" })
    if (neededPeople.fd - cur.fd > 0) out.push({ urgency: "moderate", icon: "🟡", title: `Hire ${neededPeople.fd - cur.fd} Front Desk`, reason: `Need ${neededPeople.fd}, have ${cur.fd}.`, action: "MAs can backfill FD" })
    const threeMonths = addDays(now, 90)
    data.currentStaff.forEach((s) => { const ld = d(s.lastDay); if (ld && ld > now && ld <= threeMonths) out.push({ urgency: "moderate", icon: "🟡", title: `Replace ${s.name} (${s.role})`, reason: `Last day: ${fmtShort(ld)}.`, action: "Plan replacement or coverage" }) })
    if (!out.length) out.push({ urgency: "good", icon: "🟢", title: "Staffing looks solid", reason: "No immediate hiring gaps detected.", action: "Continue monitoring monthly" })
    return out.sort((a, b) => ({ urgent: 0, moderate: 1, good: 2 } as any)[a.urgency] - ({ urgent: 0, moderate: 1, good: 2 } as any)[b.urgency])
  }

  return (
    <div>
      <h3>Staffing Needs &amp; Hiring Plan</h3>
      <div className="callout-blue">6-month outlook combining volume-based staffing rules with staff transitions.</div>
      <div className="kpi-row">
        <div className={"kpi " + (neededProviders > 0 ? "red" : "green")}><div className="label">Providers Needed</div><div className="value">{neededProviders > 0 ? "+" + neededProviders : "—"}</div><div className="sub">{cur.providers} active</div></div>
        <div className={"kpi " + (neededPeople.ma > cur.interns ? "red" : "green")}><div className="label">MAs/Interns Needed</div><div className="value">{neededPeople.ma}</div><div className="sub">{cur.interns} on roster</div></div>
        <div className={"kpi " + (neededPeople.xrt > cur.xrt ? "red" : "green")}><div className="label">XR Techs Needed</div><div className="value">{neededPeople.xrt}</div><div className="sub">{cur.xrt} on roster</div></div>
        <div className={"kpi " + (neededPeople.fd > cur.fd ? "red" : "green")}><div className="label">Front Desk Needed</div><div className="value">{neededPeople.fd}</div><div className="sub">{cur.fd} on roster</div></div>
        <div className={"kpi " + (supportGap > 0 ? "orange" : "green")}><div className="label">Support Staff Gap</div><div className="value">{supportGap > 0 ? "-" + supportGap : "✓ " + Math.abs(supportGap) + " over"}</div><div className="sub">need {totalNeededSupport} / have {totalCurSupport}</div></div>
      </div>

      <h2 style={{ marginTop: 6 }}>📋 Current Staffing Snapshot</h2>
      <table className="ia-summary-table" style={{ maxWidth: 650 }}>
        <thead><tr><th>Role</th><th>On Roster</th><th>Needed</th><th>Gap</th><th>Current Staff</th></tr></thead>
        <tbody>
          {[
            { label: "Providers", have: cur.providers, need: cur.providers + neededProviders, names: curNames.providers },
            { label: "MAs / Interns", have: cur.interns, need: neededPeople.ma, names: curNames.interns },
            { label: "XR Techs", have: cur.xrt, need: neededPeople.xrt, names: curNames.xrt },
            { label: "Front Desk", have: cur.fd, need: neededPeople.fd, names: curNames.fd },
          ].map((r) => (
            <tr key={r.label}><td className="ia-s-name">{r.label}</td><td style={{ textAlign: "center" }}>{r.have}</td><td style={{ textAlign: "center" }}>{r.need}</td><td style={{ textAlign: "center" }} className={r.need > r.have ? "surplus-neg" : "surplus-pos"}>{r.have >= r.need ? "✓ +" + (r.have - r.need) : "-" + (r.need - r.have)}</td><td style={{ fontSize: ".72rem" }}>{r.names.join(", ")}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>📅 6-Month Staffing Timeline</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="timeline-table">
          <thead><tr><th>Role</th>{months.map((m, i) => <th key={i}>{MONTHS[m.getMonth()].slice(0, 3)} {m.getFullYear()}</th>)}</tr></thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.key}>
                <td className="ia-s-name" style={{ whiteSpace: "nowrap" }}>{role.label}</td>
                {months.map((m, i) => {
                  const have = countByRole(monday(new Date(m.getFullYear(), m.getMonth(), 15))).counts[role.key]
                  const need = neededMap[role.key]
                  const diff = have - need
                  const bg = diff < 0 ? "#fff0f0" : diff > 0 ? "#f0fff4" : "#fff"
                  return <td key={i} style={{ textAlign: "center", background: bg }}><strong>{have}</strong> <span style={{ fontSize: ".7rem", color: "#888" }}>/ {need}</span><br />{diff < 0 ? <span className="surplus-neg">{diff}</span> : diff > 0 ? <span className="surplus-pos">+{diff}</span> : <span style={{ color: "#888" }}>—</span>}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 18 }}>🔴 Clinic Coverage Gaps by Role</h2>
      <table className="ia-summary-table" style={{ fontSize: ".79rem" }}>
        <thead><tr><th>Clinic</th><th>Avg Pts/Day</th><th>XRT</th><th>FD</th><th>MA</th><th>Total/Day</th></tr></thead>
        <tbody>
          {clinicNeeds.filter((cn) => cn.avgDaily > 0).map((cn) => (
            <tr key={cn.code}><td className="ia-s-name">{cn.full} <span style={{ color: "#888" }}>({cn.code})</span></td><td style={{ textAlign: "center", fontWeight: 600 }}>{cn.avgDaily}</td><td style={{ textAlign: "center" }}>{cn.xrt || "—"}</td><td style={{ textAlign: "center" }}>{cn.fd || "—"}</td><td style={{ textAlign: "center" }}>{cn.ma || "—"}</td><td style={{ textAlign: "center", fontWeight: 600 }}>{cn.xrt + cn.fd + cn.ma}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 18 }}>📋 Hiring Recommendations</h2>
      {recs.map((r, i) => (
        <div className={"hire-card " + (r.urgency === "good" ? "good" : r.urgency === "moderate" ? "moderate" : "urgent")} key={i}>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: ".88rem" }}>{r.icon} {r.title}</div><div style={{ fontSize: ".79rem", color: "#555", marginTop: 2 }}>{r.reason}</div><div style={{ fontSize: ".79rem", color: "#1a3a5c", marginTop: 1 }}><strong>→</strong> {r.action}</div></div>
        </div>
      ))}
    </div>
  )
}
