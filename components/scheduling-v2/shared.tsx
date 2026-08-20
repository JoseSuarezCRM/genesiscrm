"use client"

import { useState } from "react"
import { getProvColor, chipTextColor, isCSAProvider } from "@/lib/scheduling/providers"
import type { Provider } from "@/lib/scheduling/types"

// Sub-tab bar used inside each section (mirrors the dashboard's .intern-subtabs).
export function SubTabs({
  tabs, active, onChange, accent = "#8b0000",
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
  accent?: string
}) {
  return (
    <div className="intern-subtabs no-print">
      {tabs.map((t) => (
        <div
          key={t.key}
          className={"intern-subtab" + (active === t.key ? " active" : "")}
          style={active === t.key ? { color: accent, borderBottomColor: accent } : undefined}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </div>
      ))}
    </div>
  )
}

export function useTab(initial: string) {
  return useState(initial)
}

// Provider chip matching the dashboard's chipHTML().
export function ProvChip({
  init, providers, modClass = "", title,
}: {
  init: string
  providers: Provider[]
  modClass?: string
  title?: string
}) {
  const bg = getProvColor(init, providers)
  const fg = chipTextColor(bg)
  if (isCSAProvider(init, providers)) {
    return (
      <span
        className={"provider-chip " + modClass}
        style={{ background: bg, border: `2px dashed ${fg}`, color: fg, opacity: 0.85, display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1, padding: "2px 6px" }}
        title={title}
      >
        {init}
        <span style={{ fontSize: ".5rem", opacity: 0.7, marginTop: 1 }}>CSA</span>
      </span>
    )
  }
  return (
    <span className={"provider-chip " + modClass} style={{ background: bg, borderColor: bg, color: fg }} title={title}>
      {init}
    </span>
  )
}

export function roleBadgeClass(role: string): string {
  if (role === "Lead Intern") return "role-lead"
  if (role.includes("2026") || role === "Incoming") return "role-26"
  if (role.includes("2025")) return "role-25"
  return "role-career"
}

export function staffBadgeClass(role: string): string {
  if (role === "XR Tech") return "xrt"
  if (role === "Front Desk") return "fd"
  if (role === "Lead Intern") return "lead"
  if (role === "Careerist") return "careerist"
  return "ma"
}
