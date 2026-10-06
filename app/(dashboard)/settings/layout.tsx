"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { openableSettingsPages, type SettingsSection } from "@/lib/settings-pages"

// The menu comes from the one settings registry, filtered to the pages this
// user can open — a page they can't open isn't listed (lib/settings-pages.ts).
const SECTION_ORDER: SettingsSection[] = ["Team & Access", "Objects & Data", "Tools", "Integrations"]

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
  const { data: session } = useSession()
  const pages = openableSettingsPages(session?.user as any).filter((p) => p.inMenu)
  const settingsSections = SECTION_ORDER
    .map((title) => ({ title, items: pages.filter((p) => p.section === title).map((p) => ({ href: p.href, label: p.label })) }))
    .filter((s) => s.items.length > 0)
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
