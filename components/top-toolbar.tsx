"use client"

import { Search, Settings } from "lucide-react"
import Link from "next/link"

export default function TopToolbar() {
  return (
    <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex-1 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
          />
        </div>
      </div>
      <Link
        href="/settings/users"
        title="Settings"
        className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors ml-4"
      >
        <Settings className="h-5 w-5" />
      </Link>
    </div>
  )
}
