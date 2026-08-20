"use client"

import { useEffect, useState } from "react"
import { RefreshCw, X } from "lucide-react"

// Detects when a newer build has been deployed and prompts the user to refresh.
// The build id the running app was compiled with is baked in at build time
// (NEXT_PUBLIC_BUILD_ID); /api/version reports the currently-deployed build. When
// they differ, we show a dismissible banner. Polls on an interval + on tab focus,
// so even an idle user gets notified within a couple minutes of a deploy.
const LOADED = process.env.NEXT_PUBLIC_BUILD_ID || "dev"
const POLL_MS = 2 * 60 * 1000

export default function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null)
  const [dismissedVer, setDismissedVer] = useState<string | null>(null)

  useEffect(() => {
    // No meaningful build id locally — don't nag during dev.
    if (LOADED === "dev") return
    let alive = true

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const { version } = await res.json()
        if (alive && version && version !== "dev") setLatest(version)
      } catch {
        /* offline / transient — ignore */
      }
    }

    check()
    const id = setInterval(check, POLL_MS)
    const onVisible = () => { if (document.visibilityState === "visible") check() }
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  const outdated = !!latest && latest !== LOADED && latest !== dismissedVer
  if (!outdated) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-xl">
        <RefreshCw className="h-4 w-4 shrink-0 text-blue-600" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">A new version is available</p>
          <p className="text-xs text-zinc-500">Refresh to get the latest updates.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="ml-1 h-8 shrink-0 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Refresh
        </button>
        <button
          onClick={() => setDismissedVer(latest)}
          title="Dismiss"
          className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
