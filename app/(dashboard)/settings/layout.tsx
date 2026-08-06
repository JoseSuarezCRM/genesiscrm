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
    title: "Objects & Data",
    items: [
      { href: "/settings/objects", label: "Custom Objects" },
      { href: "/settings/data-model", label: "Data Model" },
      { href: "/settings/custom-properties", label: "Custom Properties" },
      { href: "/settings/customization", label: "Property Customization" },
      { href: "/settings/pipelines", label: "Pipelines" },
      { href: "/settings/org-rules", label: "Org Name Rules" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/settings/outreach", label: "Outreach Templates" },
      { href: "/settings/embed", label: "Embed Referral Form" },
      { href: "/settings/duplicates", label: "Duplicate Detection" },
      { href: "/settings/marketing", label: "Marketing Materials" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { href: "/settings/integrations", label: "Connected Apps" },
      { href: "/settings/integrations/api-keys", label: "API Keys" },
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
  // Highlight the most specific matching item (longest href that's a prefix),
  // so e.g. /settings/integrations/api-keys lights up "API Keys", not "Connected Apps".
  const activeHref = settingsSections
    .flatMap((s) => s.items)
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

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
                    isActive={item.href === activeHref}
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
