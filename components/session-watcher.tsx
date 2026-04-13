"use client"

import { useSession, signOut } from "next-auth/react"
import { useEffect, useRef, useState, useCallback } from "react"
import { Clock, LogOut, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

const WARNING_MS = 3 * 60 * 1000  // show banner at 3 min remaining
const TICK_IDLE  = 30_000          // check interval when not in warning zone
const TICK_WARN  = 1_000           // check every second when banner is visible

export default function SessionWatcher() {
  const { data: session, update } = useSession()
  const [remaining, setRemaining] = useState<number | null>(null)
  const [extending, setExtending] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const getRemaining = useCallback(() => {
    if (!session?.expires) return null
    return new Date(session.expires).getTime() - Date.now()
  }, [session?.expires])

  // Set up / tear down the polling interval
  const setupInterval = useCallback((warn: boolean) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      const rem = getRemaining()
      if (rem === null) return

      if (rem <= 0) {
        clearInterval(intervalRef.current!)
        signOut({ callbackUrl: "/login" })
        return
      }

      setRemaining(rem)

      // Switch to 1-second ticks when we enter warning zone
      if (rem <= WARNING_MS && !warn) {
        setupInterval(true)
      }
    }, warn ? TICK_WARN : TICK_IDLE)
  }, [getRemaining])

  // Bootstrap when session loads
  useEffect(() => {
    const rem = getRemaining()
    if (rem === null) return
    setRemaining(rem)
    setupInterval(rem <= WARNING_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [session?.expires]) // re-run whenever expiry changes (after update())

  // Also check immediately when the tab regains focus
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return
      const rem = getRemaining()
      if (rem === null) return
      if (rem <= 0) { signOut({ callbackUrl: "/login" }); return }
      setRemaining(rem)
      setupInterval(rem <= WARNING_MS)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [getRemaining, setupInterval])

  async function handleExtend() {
    setExtending(true)
    await update()              // NextAuth refreshes the JWT and pushes a new expires
    setExtending(false)
  }

  const showBanner = remaining !== null && remaining > 0 && remaining <= WARNING_MS
  if (!showBanner) return null

  const totalSec  = Math.ceil(remaining / 1000)
  const minutes   = Math.floor(totalSec / 60)
  const seconds   = totalSec % 60
  const progress  = remaining / WARNING_MS  // 1 → 0 as countdown runs

  return (
    <div
      className={cn(
        "fixed bottom-5 left-1/2 -translate-x-1/2 z-50",
        "w-full max-w-sm mx-4",
        "bg-slate-900 text-white rounded-2xl shadow-2xl shadow-black/40",
        "border border-slate-700",
        "animate-in slide-in-from-bottom-4 duration-300"
      )}
    >
      {/* Progress bar */}
      <div className="h-1 rounded-t-2xl overflow-hidden bg-slate-700">
        <div
          className={cn(
            "h-full transition-all duration-1000 ease-linear",
            progress > 0.4 ? "bg-amber-400" : "bg-red-500"
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full shrink-0",
            progress > 0.4 ? "bg-amber-400/15" : "bg-red-500/15"
          )}>
            <Clock className={cn("h-4 w-4", progress > 0.4 ? "text-amber-400" : "text-red-400")} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Session expiring soon</p>
            <p className="text-xs text-slate-400 leading-tight">
              You'll be signed out in{" "}
              <span className={cn("font-mono font-bold", progress > 0.4 ? "text-amber-400" : "text-red-400")}>
                {minutes}:{String(seconds).padStart(2, "0")}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleExtend}
            disabled={extending}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", extending && "animate-spin")} />
            {extending ? "Extending…" : "Stay logged in"}
          </button>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
