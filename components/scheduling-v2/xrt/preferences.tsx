"use client"

import { useRef } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { monday } from "@/lib/scheduling/dates"
import { xrtGetActiveXRTs, xrtGetXrClinics, ensureXrtPreferences } from "@/lib/scheduling/assign-xrt"

export default function XrtPreferences() {
  const { data, update } = useScheduling()
  const dragRef = useRef<{ xrt: string; idx: number } | null>(null)
  const now = monday(new Date())
  const xrts = xrtGetActiveXRTs(data, now)
  const xrClinics = xrtGetXrClinics(data)
  const ensured = ensureXrtPreferences(data, now)

  const commit = (mutate: (prefs: Record<string, string[]>) => void) =>
    update((dd) => { const prefs = structuredClone(ensured); mutate(prefs); dd.xrtPreferences = prefs })

  if (!xrts.length) return <div className="callout" style={{ borderLeftColor: "#9a3412", background: "#fff7ed" }}><strong>No XR Techs found.</strong> Add staff with the &quot;XR Tech&quot; role in the Roster first.</div>

  return (
    <div>
      <h2>XRT Clinic Preference Rankings</h2>
      <p className="drag-hint">Drag chips to reorder. Only XR-need clinics are shown. #1 = primary assignment.</p>
      {xrts.map((xrt) => {
        const prefs = ensured[xrt.key] || xrClinics.slice()
        const removed = xrClinics.filter((c) => !prefs.includes(c))
        return (
          <div className="pref-intern-block" key={xrt.key}>
            <div className="pref-intern-name"><span className="dot dot-active" /> {xrt.name} ({xrt.init}) <span className="role-badge" style={{ background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa" }}>XR Tech</span></div>
            <div className="pref-chips">
              {prefs.map((code, idx) => {
                const color = IA_CLINIC_COLORS[code] || "#888"
                return (
                  <span key={code} className="pref-chip" draggable style={{ background: color + "22", color, borderColor: color + "33" }}
                    onDragStart={() => { dragRef.current = { xrt: xrt.key, idx } }}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over") }}
                    onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); const dd = dragRef.current; if (dd && dd.xrt === xrt.key) commit((p) => { const [m] = p[xrt.key].splice(dd.idx, 1); p[xrt.key].splice(idx, 0, m) }); dragRef.current = null }}>
                    <span className="rank">#{idx + 1}</span>{code}
                    <span className="pref-chip-x" onClick={(e) => { e.stopPropagation(); commit((p) => { p[xrt.key] = (p[xrt.key] || []).filter((c) => c !== code) }) }} title={`Remove ${code}`}>×</span>
                  </span>
                )
              })}
              {removed.length > 0 && <span style={{ fontSize: ".72rem", color: "#888", marginLeft: 6 }}>Add:</span>}
              {removed.map((code) => { const color = IA_CLINIC_COLORS[code] || "#888"; return <span key={code} className="pref-chip" style={{ background: "#f3f4f6", color, border: `1px dashed ${color}55`, cursor: "pointer", opacity: 0.6, fontSize: ".72rem" }} onClick={() => commit((p) => { if (!p[xrt.key]) p[xrt.key] = []; if (!p[xrt.key].includes(code)) p[xrt.key].push(code) })}>+ {code}</span> })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
