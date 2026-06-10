"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Settings, Search } from "lucide-react"
import { cn } from "@/lib/utils"

const settingsSections = [
  {
    title: "Team & Access",
    items: [
      { href: "/settings/users", label: "User Management" },
    ],
  },
  {
    title: "Data & Setup",
    items: [
      { href: "/settings/custom-properties", label: "Custom Properties" },
      { href: "/settings/pipelines", label: "Pipelines" },
      { href: "/settings/org-rules", label: "Org Name Rules" },
    ],
  },
]

function SettingLink({
  href,
  label,
  isActive,
}: {
  href: string
  label: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block px-3 py-2 text-sm rounded-lg transition-colors border-l-2",
        isActive
          ? "bg-slate-100 text-slate-900 border-blue-500 font-medium"
          : "text-slate-600 border-transparent hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      {label}
    </Link>
  )
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [search, setSearch] = useState("")

  const filteredSections = settingsSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search settings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
            />
          </div>
        </div>
        <button
          title="Settings"
          className="p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors ml-4"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto">
          <div className="p-4 space-y-6">
            {(search ? filteredSections : settingsSections).map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  {section.title}
                </h3>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <SettingLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      isActive={pathname === item.href}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-white">
          {children}
        </div>
      </div>
    </div>
  )
}
