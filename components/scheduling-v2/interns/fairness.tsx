"use client"

import { useScheduling } from "@/components/scheduling-v2/store"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { monday } from "@/lib/scheduling/dates"
import { iaGetActiveInterns } from "@/lib/scheduling/assign-interns"

export default function InternFairness() {
  const { data, update } = useScheduling()
  const allInterns = iaGetActiveInterns(data, monday(new Date()))
  const hist = data.iaRotationHistory

  if (!Object.keys(hist).length) return <div><h2>Rotation Fairness Tracker</h2><p style={{ color: "#888", textAlign: "center", padding: 30 }}>Generate at least one week of assignments to see rotation data.</p></div>

  return (
    <div>
      <h2>Rotation Fairness Tracker</h2>
      <p className="desc-text">Tracks how many times each intern has been assigned to each clinic across all generated weeks.</p>
      <div style={{ overflowX: "auto" }}>
        <table className="ia-fairness-table">
          <thead><tr><th>Intern</th>{data.clinicOrder.map((code) => <th key={code} style={{ borderBottom: `3px solid ${IA_CLINIC_COLORS[code] || "#888"}` }}>{code}</th>)}<th>Total</th></tr></thead>
          <tbody>
            {allInterns.map((intern) => {
              const h = hist[intern.key] || {}
              const total = Object.values(h).reduce((s, v) => s + v, 0)
              const maxH = Math.max(...Object.values(h), 1)
              return (
                <tr key={intern.key}>
                  <td className="ia-f-name">{intern.name} ({intern.init})</td>
                  {data.clinicOrder.map((code) => {
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
      <div style={{ marginTop: 10, textAlign: "right" }}>
        <button className="btn-add" style={{ margin: 0 }} onClick={() => update((dd) => { dd.iaRotationHistory = {} })}>Reset History</button>
      </div>
    </div>
  )
}
