import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { listCustomObjects } from "@/app/actions/custom-objects"
import CustomObjectSettings from "@/components/custom-object-settings"

export default async function ObjectsSettingsPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") redirect("/")

  const objects = await listCustomObjects()

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Custom Objects</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create your own objects (like Visits or Contracts). Each gets a list, detail pages,
          permissions, a Record ID, an owner, audit fields, and custom properties — automatically.
        </p>
      </div>

      <CustomObjectSettings objects={objects} />
    </div>
  )
}
