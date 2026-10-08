import Link from "next/link"
import { cn } from "@/lib/utils"
import { canOpenSettingsPage } from "@/lib/settings-pages"
import type { SessionUserLike } from "@/lib/permissions"

// The Objects settings section: one heading, two tabs. Each tab is its own
// settings page with its own box (lib/settings-pages.ts), so a tab only shows
// to someone who can open it.
const TABS = [
  { slug: "objects", label: "Objects", href: "/settings/objects" },
  { slug: "pipelines", label: "Pipelines", href: "/settings/objects/pipelines" },
] as const

export default function ObjectsTabs({ active, user }: { active: "objects" | "pipelines"; user: SessionUserLike }) {
  const tabs = TABS.filter((t) => canOpenSettingsPage(user, t.slug))
  return (
    <div>
      <h1 className="text-2xl font-bold text-zinc-900">Objects</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Every object in the CRM — built-in and custom — and the pipelines records move through.
      </p>
      {tabs.length > 1 && (
        <div className="mt-4 flex gap-1 border-b border-zinc-200">
          {tabs.map((t) => (
            <Link
              key={t.slug}
              href={t.href}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                t.slug === active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
