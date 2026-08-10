import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { userCanLevel } from "@/lib/permissions"
import { listObjectTypes } from "@/lib/object-registry"
import ImportWizard, { type ImportObject, type AssocTarget } from "@/components/import-wizard"

export const metadata = { title: "Import Records" }

export default async function ImportPage() {
  const session = await auth()
  const user = session?.user as any
  if (!user) redirect("/login")

  const defs = await (prisma as any).customObjectDef.findMany({
    orderBy: { plural: "asc" },
    select: { key: true, singular: true, plural: true, properties: true },
  })

  // Only custom objects the user can edit are importable targets (v1).
  const objects: ImportObject[] = defs
    .filter((d: any) => userCanLevel(user, `CO:${d.key}`, "EDIT"))
    .map((d: any) => ({
      key: d.key,
      singular: d.singular,
      plural: d.plural,
      properties: ((d.properties as any[]) ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        options: p.options ?? undefined,
        optionLabels: p.optionLabels ?? undefined,
      })),
    }))

  // Any object type can be an association target (linked by id / Record ID).
  const assocTargets: AssocTarget[] = (await listObjectTypes()).map((t) => ({ key: t.key, label: t.label }))

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Import Records</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload a CSV or Excel file, map its columns to your object&apos;s fields, and create or update records. Rows are matched by <span className="font-medium text-slate-600">Record ID</span> — a matching id updates the record, a blank one creates a new record. Add a column with a related record&apos;s id to associate them.
        </p>
      </div>
      {objects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-10 text-center text-sm text-slate-500">
          You don&apos;t have edit access to any custom objects yet. Create one under{" "}
          <a href="/settings/objects" className="text-blue-600 hover:underline">Custom Objects</a> to import records.
        </div>
      ) : (
        <ImportWizard objects={objects} assocTargets={assocTargets} />
      )}
    </div>
  )
}
