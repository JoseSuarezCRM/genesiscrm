"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCw } from "lucide-react"

// Error boundary for the whole dashboard segment.
//
// Server actions here throw on a refused permission (lib/auth-guard.ts), and
// without a boundary that rejection reached Next's default error page — a dead
// end with no way back. This catches anything the UI's own permission gating
// misses and keeps the user inside the app.
//
// The message itself is redacted in production builds (the client receives only
// `digest`), so don't render `error.message` — it would read as a stack trace to
// a user and say nothing useful. The digest is logged for correlation instead.

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Something went wrong</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        That didn&apos;t work. You may not have permission for this action — if you think you should,
        ask an administrator to check your access.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 font-mono text-[11px] text-slate-300">Reference: {error.digest}</p>
      )}
    </div>
  )
}
