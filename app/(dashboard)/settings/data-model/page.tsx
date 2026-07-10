import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { listAssociationDefs, listObjectTypes } from "@/app/actions/associations"
import DataModelSettings from "@/components/data-model-settings"

export default async function DataModelPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") redirect("/")

  const [defs, types] = await Promise.all([listAssociationDefs(), listObjectTypes()])

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data Model</h1>
        <p className="text-sm text-slate-500 mt-1">
          Relate objects so their records can be associated. Related records show up as cards
          on each record&apos;s detail page.
        </p>
      </div>
      <DataModelSettings defs={defs} types={types} />
    </div>
  )
}
