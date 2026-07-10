import { notFound } from "next/navigation"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel, userCanDelete } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getCustomObject } from "@/app/actions/custom-objects"
import { listCustomObjectRecords } from "@/app/actions/custom-object-records"
import CustomObjectList from "@/components/custom-object-list"

interface Props { params: { key: string } }

export default async function CustomObjectListPage({ params }: Props) {
  const def = await getCustomObject(params.key)
  if (!def) notFound()

  const session = await requireView(`CO:${params.key}`)
  const user = session?.user as any
  const canEdit = userCanLevel(user, `CO:${params.key}`, "EDIT")
  const canDelete = userCanDelete(user, `CO:${params.key}`)

  const [records, users] = await Promise.all([
    listCustomObjectRecords(params.key),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{def.plural}</h1>
        <p className="text-sm text-slate-500">{records.length} {records.length === 1 ? def.singular.toLowerCase() : def.plural.toLowerCase()}</p>
      </div>

      <CustomObjectList
        objectKey={def.key}
        singular={def.singular}
        plural={def.plural}
        ownerLabel={def.ownerLabel}
        properties={def.properties}
        records={records as any}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  )
}
