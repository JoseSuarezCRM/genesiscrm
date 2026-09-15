"use client"

import { useScheduling } from "@/components/scheduling-v2/store"

// Settings — the five fields the v10 dashboard still exposes. growthPct and
// orientDays survive in the payload (orientDays still gates incoming interns out
// of the assignment engine) but have no UI there, so none here either.

const FIELDS: { key: "targetPts" | "daysPerMonth" | "weeksProject" | "calWeeks"; label: string; min: number; max?: number; help?: string }[] = [
  { key: "targetPts", label: "Target Pts/Provider/Day", min: 1, help: "NH runs ~65." },
  { key: "daysPerMonth", label: "Working Days per Month", min: 1 },
  { key: "weeksProject", label: "Weeks to Project", min: 4, max: 52 },
  { key: "calWeeks", label: "Calendar Weeks to Show", min: 2, max: 52 },
]

export default function SettingsPage() {
  const { data, update } = useScheduling()
  const set = (key: keyof typeof data.settings, value: string) =>
    update((d) => { d.settings[key] = value })

  return (
    <div className="section no-print">
      <h2>Settings</h2>
      <div className="settings-grid">
        {FIELDS.map((f) => (
          <div className="setting-item" key={f.key}>
            <label>{f.label}</label>
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={data.settings[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
            {f.help && <span className="help">{f.help}</span>}
          </div>
        ))}
        <div className="setting-item">
          <label>Starting Week A (Monday)</label>
          <input
            type="date"
            value={data.settings.startWeek}
            onChange={(e) => set("startWeek", e.target.value)}
          />
          <span className="help">Anchors the whole A/B rotation.</span>
        </div>
      </div>
    </div>
  )
}
