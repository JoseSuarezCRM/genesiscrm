import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import CustomPropertyManager from "@/components/custom-property-manager"
import { listCustomProperties } from "@/app/actions/custom-properties"
import { CP_ENTITIES } from "@/lib/custom-property-entities"

export default async function CustomPropertiesPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/")
  }

  const lists = await Promise.all(CP_ENTITIES.map((e) => listCustomProperties(e.type)))
  const propsByEntity = Object.fromEntries(CP_ENTITIES.map((e, i) => [e.type, lists[i]]))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Custom Properties</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create and manage custom fields on any object. They appear on the record, in filters, and in exports.
        </p>
      </div>

      <CustomPropertyManager propsByEntity={propsByEntity as any} />
    </div>
  )
}
