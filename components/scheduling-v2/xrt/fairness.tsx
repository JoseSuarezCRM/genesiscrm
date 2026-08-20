"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { monday } from "@/lib/scheduling/dates"
import { xrtGetActiveXRTs, xrtGetXrClinics } from "@/lib/scheduling/assign-xrt"

export default function XrtFairness() {
  const { data, update } = useScheduling()
  const xrts = xrtGetActiveXRTs(data, monday(new Date()))
  const xrClinics = xrtGetXrClinics(data)
  const hist = data.xrtRotationHistory
  if (!Object.keys(hist).length) return <div><h2>XRT Rotation Fairness Tracker</h2><p style={{ color: "#888", textAlign: "center", padding: 30 }}>Generate at least one week of XRT assignments to see rotation data.</p></div>
  return (
    <div>
      <h2>XRT Rotation Fairness Tracker</h2>
      <div style={{ overflowX: "auto" }}>
        <table className="ia-fairness-table">
          <thead><tr><th>XR Tech</th>{xrClinics.map((code) => <th key={code} style={{ borderBottom: `3px solid ${IA_CLINIC_COLORS[code] || "#888"}` }}>{code}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {xrts.map((xrt) => {
              const h = hist[xrt.key] || {}
              const total = Object.values(h).reduce((s, v) => s + v, 0)
              const maxH = Math.max(...Object.values(h), 1)
              return (
                <tr key={xrt.key}>
                  <td className="ia-f-name">{xrt.name} ({xrt.init})</td>
                  {xrClinics.map((code) => {
                    const count = h[code] || 0
                    const color = IA_CLINIC_COLORS[code] || "#888"
                    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16)
                    const bg = count > 0 ? `rgba(${r},${g},${b},${0.1 + (count / maxH) * 0.3})` : "transparent"
                    return <td key={code} style={{ background: bg, fontWeight: count ? 600 : 400 }}>{count || "—"}</td>
                  })}
                  <td style={{ fontWeight: 700 }}>{total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, textAlign: "right" }}><button className="btn-add" style={{ margin: 0 }} onClick={() => update((dd) => { dd.xrtRotationHistory = {} })}>Reset XRT History</button></div>
    </div>
  )
}
