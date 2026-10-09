import { settingsPageOrRedirect } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { getNavLayout } from "@/lib/nav-layout-server"
import NavigationSettings from "@/components/navigation-settings"

export const dynamic = "force-dynamic"

// The sidebar menu for everyone: section order, names and icons, where each page
// sits, renamed and hidden items, and links to outside websites.
export default async function NavigationSettingsPage() {
  await settingsPageOrRedirect("navigation")
  const [layout, customObjects] = await Promise.all([
    getNavLayout(),
    prisma.customObjectDef.findMany({ orderBy: [{ order: "asc" }, { plural: "asc" }], select: { key: true, plural: true } }),
  ])

  return (
    <div className="max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Navigation</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Arrange the sidebar menu for everyone. Moving, renaming or hiding an item never changes who can open it —
          each person still sees only what their access allows.
        </p>
      </div>
      <NavigationSettings initialLayout={layout} customObjects={customObjects} />
    </div>
  )
}
