import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { firstSettingsPage } from "@/lib/settings-pages"

export const dynamic = "force-dynamic"

// The Settings gear lands here: straight on the first settings page this person
// can open. It used to link to User Management, which is admin-only by default,
// so anyone else was bounced to the dashboard.
export default async function SettingsIndexPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const first = firstSettingsPage(session.user as any)
  if (first) redirect(first.href)

  return (
    <div className="p-6">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-zinc-900">No settings pages yet</h1>
        <p className="mt-2 text-sm text-zinc-500">
          You don&apos;t have access to any settings pages. An admin can give you the ones you need in
          Settings → User Management.
        </p>
      </div>
    </div>
  )
}
