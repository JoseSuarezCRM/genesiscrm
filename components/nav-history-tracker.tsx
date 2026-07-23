"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

// Counts how many in-app navigations have happened in this tab (per session).
// SmartBackLink reads it to decide whether a real browser "back" is safe — i.e.
// the previous history entry belongs to this app, so going back restores the
// exact page, section, filters and scroll position the user came from.
export const NAV_COUNT_KEY = "app-nav-count"

export default function NavHistoryTracker() {
  const pathname = usePathname()
  useEffect(() => {
    try {
      const n = Number(sessionStorage.getItem(NAV_COUNT_KEY) ?? "0")
      sessionStorage.setItem(NAV_COUNT_KEY, String(n + 1))
    } catch {
      // Private mode / storage disabled — SmartBackLink just falls back to href.
    }
  }, [pathname])
  return null
}
