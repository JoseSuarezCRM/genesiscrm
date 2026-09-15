"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useScheduling } from "./store"

// The v10 dashboard's nested sidebar (its .sidebar block), rendered inside the
// CRM shell rather than fixed to the viewport — see the layout overrides at the
// end of planner.css.

const ITEMS: { href: string; label: string }[] = [
  { href: "/scheduling-v2", label: "Master Schedule" },
  { href: "/scheduling-v2/schedule-builder", label: "Schedule Builder" },
  { href: "/scheduling-v2/roster", label: "Roster" },
  { href: "/scheduling-v2/settings", label: "Settings" },
]

export default function PlannerSidebar() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/scheduling-v2" ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span><span className="logo-g">G</span><span className="logo-o">O</span></span>
        </div>
        <div className="sidebar-brand">
          <span className="brand-genesis">Genesis</span>
          <span className="brand-ortho">Orthopedics</span>
          <span className="brand-sub">&amp; Sports Medicine</span>
        </div>
      </div>
      <div className="sidebar-nav">
        {ITEMS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={"sidebar-item" + (isActive(it.href) ? " active" : "")}
          >
            {it.label}
          </Link>
        ))}
      </div>
      <SaveStatus />
    </nav>
  )
}

/**
 * The planner's state is org-wide and autosaves, so the sidebar foot carries the
 * only signal that anything is in flight — plus an escape hatch to force it.
 */
function SaveStatus() {
  const { status, savedAt, saveNow } = useScheduling()
  const label =
    status === "saving" ? "Saving…"
    : status === "dirty" ? "Unsaved changes"
    : status === "saved" && savedAt
      ? `Saved · ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "Shared org-wide"

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)", padding: "10px 14px", display: "flex",
        alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: status === "dirty" ? "var(--flag)" : "var(--ink-faint)" }}>
        {label}
      </span>
      <button
        className="btn-add"
        style={{ margin: 0, padding: "3px 10px", fontSize: 11 }}
        onClick={saveNow}
      >
        Save
      </button>
    </div>
  )
}
