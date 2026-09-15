"use client"

import { getProvColor, chipTextColor, isCSAProvider, shortTime } from "@/lib/scheduling/providers"
import type { Provider } from "@/lib/scheduling/types"

// Sub-tab bar — the dashboard's .intern-subtabs.
export function SubTabs({
  tabs, active, onChange,
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div className="intern-subtabs no-print" style={{ overflowX: "auto", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
      {tabs.map((t) => (
        <div
          key={t.key}
          className={"intern-subtab" + (active === t.key ? " active" : "")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </div>
      ))}
    </div>
  )
}

/**
 * Provider chip — the dashboard's chipHTML(). Contracted providers ("(CSA)" in
 * the name) get a dashed border and a CSA label so they read differently at a
 * glance; a late start puts the time under the chip.
 */
export function ProvChip({
  init, providers, modClass = "", title, lateStart, draggable, dragProps,
}: {
  init: string
  providers: Provider[]
  modClass?: string
  title?: string
  lateStart?: string | null
  draggable?: boolean
  dragProps?: React.HTMLAttributes<HTMLSpanElement>
}) {
  const bg = getProvColor(init, providers)
  const fg = chipTextColor(bg)
  const csa = isCSAProvider(init, providers)
  const cls = `provider-chip ${modClass}${lateStart ? " late-start" : ""}`.trim()

  const chip = csa ? (
    <span
      className={cls}
      style={{
        background: bg, border: `2px dashed ${fg}`, color: fg, opacity: 0.85,
        display: "inline-flex", flexDirection: "column", alignItems: "center",
        lineHeight: 1, padding: "2px 6px", cursor: draggable ? "grab" : undefined,
      }}
      title={title}
      draggable={draggable}
      {...dragProps}
    >
      {init}
      <span style={{ fontSize: ".5rem", opacity: 0.7, marginTop: 1 }}>CSA</span>
    </span>
  ) : (
    <span
      className={cls}
      style={{ background: bg, borderColor: bg, color: fg, cursor: draggable ? "grab" : undefined }}
      title={title}
      draggable={draggable}
      {...dragProps}
    >
      {init}
    </span>
  )

  if (!lateStart) return chip
  return (
    <>
      {chip}
      <span style={{ fontSize: 9, color: "var(--flag)", textAlign: "center", display: "block", marginTop: -2 }}>
        🕐{shortTime(lateStart)}
      </span>
    </>
  )
}

export function staffBadgeClass(role: string): string {
  if (role === "XR Tech" || role === "MRI Tech" || role === "XRT/MRI Tech") return "xrt"
  if (role === "Front Desk") return "fd"
  if (role === "Lead Intern") return "lead"
  if (role === "Careerist") return "careerist"
  return "ma"
}

/** The navy full-width row that groups the surgery clinics / task block. */
export function SectionRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          background: "var(--navy)", color: "#fff", padding: "5px 10px", fontSize: "10.5px",
          textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600,
        }}
      >
        {children}
      </td>
    </tr>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>
}
