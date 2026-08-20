"use client"

import { useState } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { monday, d } from "@/lib/scheduling/dates"
import { clinicCalcs } from "@/lib/scheduling/analytics"

export default function ClinicAnalysis() {
  const { data } = useScheduling()
  const [base, setBase] = useState<"A" | "B">("A")
  const calcs = clinicCalcs(data, monday(d(data.settings.startWeek) || new Date()), base)

  return (
    <div>
      <div className="callout-blue"><strong>Baseline</strong> uses the selected week. <strong>Live</strong> reflects the start week accounting for PTO and leaves.</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: ".75rem", textTransform: "uppercase", color: "#555", fontWeight: 600, letterSpacing: ".4px" }}>Baseline week:</span>
        <button className={"btn-week" + (base === "A" ? " active" : "")} onClick={() => setBase("A")}>A Week</button>
        <button className={"btn-week" + (base === "B" ? " active" : "")} onClick={() => setBase("B")}>B Week</button>
      </div>
      <div>
        {calcs.map((c) => {
          const uc = c.utilization > 110 ? "red" : c.utilization > 90 ? "yellow" : c.utilization > 70 ? "green" : "blue"
          const sb = c.status === "understaffed" ? <span className="badge badge-hire">NEEDS PROVIDERS</span> : c.status === "overstaffed" ? <span className="badge badge-over">CAPACITY AVAILABLE</span> : <span className="badge badge-ok">BALANCED</span>
          const tr = c.trend != null ? (c.trend >= 0 ? "↑" : "↓") + Math.abs(Math.round(c.trend)) + "% YoY" : "—"
          const tc = c.trend != null ? (c.trend >= 0 ? "#2ecc40" : "#d9534f") : "#888"
          const maxV = Math.max(...c.allVols.map((v) => v.visits), 1)
          const liveReduced = c.liveProvDays < c.provDays
          const liveUc = c.liveUtil > 110 ? "red" : c.liveUtil > 90 ? "yellow" : c.liveUtil > 70 ? "green" : "blue"
          return (
            <div className={"clinic-card " + c.status} key={c.code}>
              <div className="clinic-top">
                <div className="clinic-top-left">
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}><h3 style={{ margin: 0 }}>{c.meta.full}</h3>{sb}<span className="badge-contract">{c.code}</span></div>
                  <div style={{ fontSize: ".79rem", color: "#555", marginBottom: 7 }}><strong>Providers:</strong> {c.assignedProvs.length ? c.assignedProvs.map((p) => <span key={p.init}><strong>{p.init}</strong> ({p.daysHere}d) </span>) : <span style={{ color: "#d9534f" }}>None</span>}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="spark">{c.allVols.map((v, i) => <div key={i} className="spark-bar" style={{ height: Math.max(1, Math.round((v.visits / maxV) * 32)) }} title={`${v.month} ${v.year}: ${v.visits}`} />)}</div>
                    <span style={{ fontSize: ".73rem", color: tc, fontWeight: 600 }}>{tr}</span>
                  </div>
                </div>
                <div className="clinic-top-right">
                  <div className="clinic-metric"><div className="val">{c.avgVol.toLocaleString()}</div><div className="lbl">Avg Monthly</div></div>
                  <div className="clinic-metric"><div className="val">{c.provDays}</div><div className="lbl">Baseline Prov-Days</div></div>
                  <div className="clinic-metric"><div className="val" style={{ color: liveReduced ? "#d9534f" : "#333" }}>{c.liveProvDays}</div><div className="lbl">Live Prov-Days</div></div>
                  <div className="clinic-metric"><div className="val" style={{ color: c.ptsPerProvDay > 30 ? "#d9534f" : c.ptsPerProvDay > 25 ? "#f5a623" : "#333" }}>{c.ptsPerProvDay}</div><div className="lbl">Pts/Prov/Day</div></div>
                  <div className="clinic-metric"><div className="val">{c.monthlyCapacity.toLocaleString()}</div><div className="lbl">Baseline Cap</div></div>
                </div>
              </div>
              <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: ".73rem", color: "#555", width: 70 }}>Baseline</span>
                <div className="util-bar-wrap"><div className={"util-bar " + uc} style={{ width: `${Math.min(c.utilization, 150) / 1.5}%` }} /><div className="util-text">{c.utilization}%</div></div>
                {c.gap > 0 && <span style={{ fontSize: ".73rem", color: "#d9534f", fontWeight: 600 }}>Gap: {c.gap}/mo</span>}
              </div>
              <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: ".73rem", color: "#555", width: 70 }}>Live</span>
                <div className="util-bar-wrap"><div className={"util-bar " + liveUc} style={{ width: `${Math.min(c.liveUtil, 150) / 1.5}%` }} /><div className="util-text">{c.liveUtil}%</div></div>
                {liveReduced && <span style={{ background: "#fff3cd", border: "1px solid #ffe08a", borderRadius: 3, padding: "1px 7px", fontSize: ".67rem", color: "#856404", fontWeight: 600 }}>⚠ {c.live.gaps.length} gap{c.live.gaps.length !== 1 ? "s" : ""} this week</span>}
              </div>
              {liveReduced && c.live.gaps.length > 0 && <div style={{ fontSize: ".72rem", color: "#856404", marginTop: 3 }}>Gaps: {c.live.gaps.map((g) => g.day + " (" + g.absent.join(",") + ")").join(" · ")}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
