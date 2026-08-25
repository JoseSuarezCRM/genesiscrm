"use client"

import { createContext, useContext, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, LayoutDashboard, FileBarChart2, Plus, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { createDashboard } from "@/app/actions/dashboards"

// The shell owns the search string; list views read it to filter their rows.
const SearchCtx = createContext("")
export function useReportingSearch() { return useContext(SearchCtx) }

export default function ReportingShell({
  active,
  counts,
  children,
}: {
  active: "reports" | "dashboards"
  counts: { reports: number; dashboards: number }
  children: ReactNode
}) {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, startCreate] = useTransition()

  function newDashboard() {
    setCreateOpen(false)
    startCreate(async () => {
      const { id } = await createDashboard("Untitled dashboard")
      router.push(`/reports/dashboard/${id}`)
    })
  }

  const railLinks = [
    { key: "dashboards", href: "/reports/dashboard", label: "My dashboards", count: counts.dashboards, icon: LayoutDashboard },
    { key: "reports", href: "/reports", label: "My reports", count: counts.reports, icon: FileBarChart2 },
  ] as const

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">Reports</h1>
        <div className="relative">
          <button
            onClick={() => setCreateOpen((o) => !o)}
            disabled={creating}
            onBlur={() => setTimeout(() => setCreateOpen(false), 150)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Create <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {createOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
              <Link href="/reports/builder" className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50" onMouseDown={(e) => e.preventDefault()}>
                <FileBarChart2 className="h-3.5 w-3.5 text-zinc-400" /> Report
              </Link>
              <button onMouseDown={(e) => { e.preventDefault(); newDashboard() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50">
                <LayoutDashboard className="h-3.5 w-3.5 text-zinc-400" /> Dashboard
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <aside className="w-60 shrink-0 border-r border-zinc-200 p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-9 w-full rounded-full border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm outline-none focus:border-zinc-400 focus:bg-white"
            />
          </div>
          <nav className="space-y-0.5">
            {railLinks.map((l) => {
              const Icon = l.icon
              const isActive = l.key === active
              return (
                <Link
                  key={l.key}
                  href={l.href}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-zinc-100 font-semibold text-zinc-900" : "text-zinc-600 hover:bg-zinc-50",
                  )}
                >
                  <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-zinc-400" />{l.label}</span>
                  <span className="text-xs text-zinc-400">{l.count}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-auto p-6">
          <SearchCtx.Provider value={search}>{children}</SearchCtx.Provider>
        </main>
      </div>
    </div>
  )
}
