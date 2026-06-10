"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto">
        <div className="p-4 space-y-6">
          {settingsSections.map((section) => (
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
  )
}
