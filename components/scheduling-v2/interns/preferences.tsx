"use client"

import { useRef } from "react"
import { useScheduling } from "@/components/scheduling-v2/store"
import { roleBadgeClass } from "@/components/scheduling-v2/shared"
import { IA_CLINIC_COLORS } from "@/lib/scheduling/constants"
import { monday } from "@/lib/scheduling/dates"
import { iaGetActiveInterns, ensureInternPreferences } from "@/lib/scheduling/assign-interns"

export default function InternPreferences() {
  const { data, update } = useScheduling()
  const dragRef = useRef<{ intern: string; idx: number } | null>(null)

  const ensured = ensureInternPreferences(data)
  const allInterns = iaGetActiveInterns(data, monday(new Date()))

  const commit = (mutate: (prefs: Record<string, string[]>, excl: Record<string, string[]>) => void) =>
    update((dd) => {
      const prefs: Record<string, string[]> = structuredClone(ensured.iaPreferences)
      const excl: Record<string, string[]> = structuredClone(ensured.iaExcludedClinics)
      mutate(prefs, excl)
      dd.iaPreferences = prefs
      dd.iaExcludedClinics = excl
    })

  const onDrop = (internKey: string, targetIdx: number) => {
    const dragData = dragRef.current
    if (!dragData || dragData.intern !== internKey) return
    commit((prefs) => {
      const arr = prefs[internKey]
      const [moved] = arr.splice(dragData.idx, 1)
      arr.splice(targetIdx, 0, moved)
    })
    dragRef.current = null
  }

  const exclude = (internKey: string, code: string) =>
    commit((prefs, excl) => {
      if (!excl[internKey]) excl[internKey] = []
      if (!excl[internKey].includes(code)) excl[internKey].push(code)
      prefs[internKey] = (prefs[internKey] || []).filter((c) => c !== code)
    })

  const include = (internKey: string, code: string) =>
    commit((prefs, excl) => {
      excl[internKey] = (excl[internKey] || []).filter((c) => c !== code)
      if (!prefs[internKey]) prefs[internKey] = []
      if (!prefs[internKey].includes(code)) prefs[internKey].push(code)
    })

  return (
    <div>
      <h2>Clinic Preference Rankings</h2>
      <p className="drag-hint">Drag clinic chips to reorder each intern&apos;s preferences. #1 = primary assignment.</p>
      {allInterns.map((intern) => {
        const prefs = ensured.iaPreferences[intern.key] || []
        const excluded = ensured.iaExcludedClinics[intern.key] || []
        return (
          <div className="pref-intern-block" key={intern.key}>
            <div className="pref-intern-name">
              <span className={"dot " + (intern.avail >= 0.8 ? "dot-active" : intern.avail >= 0.4 ? "dot-leave" : "dot-inactive")} />
              {intern.name} ({intern.init}) <span className={"role-badge " + roleBadgeClass(intern.role)}>{intern.role}</span>
            </div>
            <div className="pref-chips">
              {prefs.map((code, idx) => {
                const color = IA_CLINIC_COLORS[code] || "#888"
                return (
                  <span key={code} className="pref-chip" draggable style={{ background: color + "22", color, borderColor: color + "33" }}
                    onDragStart={() => { dragRef.current = { intern: intern.key, idx } }}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over") }}
                    onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("drag-over"); onDrop(intern.key, idx) }}>
                    <span className="rank">#{idx + 1}</span>{code}
                    <span className="pref-chip-x" onClick={(e) => { e.stopPropagation(); exclude(intern.key, code) }} title={`Remove ${code}`}>×</span>
                  </span>
                )
              })}
            </div>
            {excluded.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: ".67rem", color: "#999", textTransform: "uppercase", letterSpacing: ".3px" }}>Excluded:</span>
                {excluded.map((code) => (
                  <span key={code} className="pref-chip" style={{ background: "#f0f0f0", color: "#999", borderColor: "#ddd", opacity: 0.7, cursor: "pointer" }} onClick={() => include(intern.key, code)} title={`Add ${code} back`}>
                    <span style={{ color: "#2ecc40", fontWeight: 700, marginRight: 2 }}>+</span>{code}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
