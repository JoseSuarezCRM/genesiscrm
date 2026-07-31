import { notFound } from "next/navigation"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel, userCanDelete } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { getCustomObject } from "@/app/actions/custom-objects"
import { getCustomObjectRecord, recordCustomObjectView } from "@/app/actions/custom-object-records"
import { loadAssociationCards } from "@/lib/record-associations"
import { loadPropertyCards } from "@/lib/record-cards"
import { recordName } from "@/lib/record-name"
import { listRecordActivities } from "@/app/actions/record-activity"
import RecordDetailShell from "@/components/record-detail-shell"
import RecordActionsMenu from "@/components/record-actions-menu"
import RecordMiddleTabs from "@/components/record-middle-tabs"
import RecordPropertyCards from "@/components/record-property-cards"
import RecordAssociationCards from "@/components/record-association-cards"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordEngagementBar from "@/components/record-engagement-bar"

interface Props { params: { key: string; id: string } }

// A custom-object record renders through exactly the same components as a
// Referral — shell, property cards, tabs, association cards, engagement bar.
export default async function CustomRecordDetailPage({ params }: Props) {
  const def = await getCustomObject(params.key)
  if (!def) notFound()

  const objectType = `CO:${params.key}`
  const session = await requireView(objectType)
  const canEdit = userCanLevel(session?.user as any, objectType, "EDIT")
  const canEditCards = userCanLevel(session?.user as any, "VIEWS", "EDIT")
  const canDelete = userCanDelete(session?.user as any, objectType)
  const canDeleteActivities = userCan(session?.user as any, "DELETE_ACTIVITIES")

  const record = await getCustomObjectRecord(params.key, params.id)
  if (!record) notFound()
  await recordCustomObjectView(params.key, params.id)

  const [users, assocCards, activityItems, propertyCards] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    loadAssociationCards(objectType, params.id),
    listRecordActivities(objectType, params.id),
    loadPropertyCards(objectType, record as any, def.ownerLabel),
  ])

  const userOptions = users.map((u) => ({ id: u.id, label: u.name ?? u.email }))
  const title = recordName(def.properties as any[], record.values as any, `${def.singular} #${record.recordNumber ?? ""}`)

  return (
    <RecordDetailShell
      backHref={`/objects/${def.key}`}
      backLabel={`Back to ${def.plural}`}
      title={String(title)}
      actions={
        <RecordActionsMenu entityType={objectType} recordId={record.id} title={String(title)}
          catalog={propertyCards.catalog} values={propertyCards.values}
          userMap={Object.fromEntries(userOptions.map((u) => [u.id, u.label]))}
          canEdit={canEdit} canDelete={canDelete} />
      }
      subtitle={<span className="font-mono text-slate-400">Record ID #{record.recordNumber ?? "—"}</span>}
      engagementBar={
        <RecordEngagementBar recordType={objectType} recordId={record.id} users={userOptions} canEdit={canEdit} compact />
      }
      left={
        <>
          <RecordPropertyCards
            entityType={objectType}
            recordId={record.id}
            cards={propertyCards.cards}
            catalog={propertyCards.catalog}
            values={propertyCards.values}
            canEdit={canEdit}
            canEditCards={canEditCards}
            users={userOptions}
          />
        </>
      }
      middle={
        <RecordMiddleTabs
          overview={
            <RecordPropertyCards
              entityType={objectType}
              recordId={record.id}
              cards={propertyCards.middleCards}
              catalog={propertyCards.catalog}
              values={propertyCards.values}
              canEdit={canEdit}
              canEditCards={canEditCards}
              section="MIDDLE"
              users={userOptions}
            />
          }
          activities={
            <RecordActivityFeed
              recordType={objectType}
              recordId={record.id}
              items={activityItems as any}
              users={userOptions}
              canEdit={canEdit}
              showActions={false}
              canDeleteActivities={canDeleteActivities}
            />
          }
        />
      }
      right={
        <RecordAssociationCards recordType={objectType} recordId={record.id} cards={assocCards} canEdit={canEdit} />
      }
    />
  )
}
