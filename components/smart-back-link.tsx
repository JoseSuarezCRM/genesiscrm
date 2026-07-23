"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { NAV_COUNT_KEY } from "@/components/nav-history-tracker"

/**
 * A back link that returns you to the exact page + section you came from.
 *
 * If you reached this page by navigating within the app, it does a real browser
 * back() — restoring the previous URL (its tab, filters, pagination) and the
 * scroll position. Otherwise (direct link, new tab, external referrer) it falls
 * back to `href`. Rendering a real <Link> keeps middle-click / open-in-new-tab
 * and no-JS working.
 */
export default function SmartBackLink({
  href, className, children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    try {
      const navCount = Number(sessionStorage.getItem(NAV_COUNT_KEY) ?? "0")
      setCanGoBack(navCount > 1 && window.history.length > 1)
    } catch {
      setCanGoBack(false)
    }
  }, [])

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        // Let modified clicks (new tab, etc.) behave normally.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (canGoBack) {
          e.preventDefault()
          router.back()
        }
      }}
    >
      {children}
    </Link>
  )
}
