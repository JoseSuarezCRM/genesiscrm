import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getCustomObject } from "@/app/actions/custom-objects"
import { getCustomObjectRecord, recordCustomObjectView } from "@/app/actions/custom-object-records"
import { loadAssociationCards } from "@/lib/record-associations"
import { listRecordActivities } from "@/app/actions/record-activity"
import CustomObjectDetail from "@/components/custom-object-detail"

interface Props { params: { key: string; id: string } }

export default async function CustomRecordDetailPage({ params }: Props) {
  const def = await getCustomObject(params.key)
  if (!def) notFound()

  const session = await requireView(`CO:${params.key}`)
  const canEdit = userCanLevel(session?.user as any, `CO:${params.key}`, "EDIT")

  const record = await getCustomObjectRecord(params.key, params.id)
  if (!record) notFound()
  await recordCustomObjectView(params.key, params.id)

  const [users, associations, activityItems] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    loadAssociationCards(`CO:${params.key}`, params.id),
    listRecordActivities(`CO:${params.key}`, params.id),
  ])

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <Link href={`/objects/${def.key}`} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to {def.plural}
      </Link>

      <CustomObjectDetail
        objectKey={def.key}
        singular={def.singular}
        ownerLabel={def.ownerLabel}
        properties={def.properties}
        cards={def.cards}
        record={record as any}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        canEdit={canEdit}
        associations={associations as any}
        activityItems={activityItems as any}
      />
    </div>
  )
}
