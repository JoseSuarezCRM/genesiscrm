import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireView } from "@/lib/auth-guard"
import { userCan, userCanLevel } from "@/lib/permissions"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import PracticeDetailClient from "@/components/practice-detail-client"
import { loadCustomPropertiesForDetail } from "@/lib/custom-properties-loader"
import RecordActivityFeed from "@/components/record-activity-feed"
import RecordEngagementBar from "@/components/record-engagement-bar"
import RecordOwnerCard from "@/components/record-owner-card"
import RecordDetailShell from "@/components/record-detail-shell"
import RecordPropertyCards from "@/components/record-property-cards"
import RecordAssociationCards from "@/components/record-association-cards"
import { loadAssociationCards } from "@/lib/record-associations"
import { loadPropertyCards } from "@/lib/record-cards"
import RecordMiddleTabs from "@/components/record-middle-tabs"
import { listRecordActivities } from "@/app/actions/record-activity"

interface Props { params: { id: string } }

export default async function PracticeDetailPage({ params }: Props) {
  const session = await requireView("PRACTICES")
  const isAdmin = userCanLevel(session?.user as any, "PRACTICES", "EDIT")

  const [practice, referrals, customProperties] = await Promise.all([
    prisma.referringPractice.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { referrals: true } },
        owner: { select: { id: true, name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        updatedBy: { select: { name: true, email: true } },
        locations: {
          orderBy: { name: "asc" },
          include: { _count: { select: { referrals: true } } },
        },
        doctors: {
          orderBy: { name: "asc" },
          include: {
            _count: { select: { referrals: true } },
            locations: { include: { location: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.referral.findMany({
      where: { referringPracticeId: params.id },
      orderBy: { referralDate: "desc" },
      take: 100,
      select: {
        id: true,
        patientFirstName: true,
        patientLastName: true,
        referralDate: true,
        status: true,
        referringDoctor: { select: { id: true, name: true, title: true } },
      },
    }),
    loadCustomPropertiesForDetail("PRACTICE", params.id),
  ])

  if (!practice) notFound()

  const [activityItems, feedUsers] = await Promise.all([
    listRecordActivities("PRACTICE", practice.id),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ])

  const userOptions = feedUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))
  const canEditCards = userCanLevel(session?.user as any, "VIEWS", "EDIT")
  const propertyCards = await loadPropertyCards("PRACTICE", practice as any)
  const assocCards = await loadAssociationCards("PRACTICE", practice.id)

  return (
    <RecordDetailShell
      backHref="/referring-doctors"
      backLabel="Back to Referring Providers"
      title={practice.name}
      subtitle={practice.phone ?? undefined}
      badges={
        <span className="text-sm text-slate-400">
          {practice._count.referrals} referral{practice._count.referrals !== 1 ? "s" : ""}
        </span>
      }
      engagementBar={
        <RecordEngagementBar recordType="PRACTICE" recordId={practice.id} users={userOptions} canEdit={isAdmin} compact />
      }
      left={
        <>
        <RecordPropertyCards
          entityType="PRACTICE"
          recordId={practice.id}
          cards={propertyCards.cards}
          catalog={propertyCards.catalog}
          values={propertyCards.values}
          canEdit={isAdmin}
          canEditCards={canEditCards}
        />
        <RecordOwnerCard
          type="PRACTICE"
          recordId={practice.id}
          ownerLabel="Practice Owner"
          ownerId={practice.ownerId}
          users={userOptions}
          createdByName={practice.createdBy?.name ?? practice.createdBy?.email ?? null}
          createdAt={practice.createdAt}
          updatedByName={practice.updatedBy?.name ?? practice.updatedBy?.email ?? null}
          updatedAt={practice.updatedAt}
          canEdit={isAdmin}
        />
        </>
      }
      middle={
        <RecordMiddleTabs
          overview={
            <>
          <RecordPropertyCards
            entityType="PRACTICE"
            recordId={practice.id}
            cards={propertyCards.middleCards}
            catalog={propertyCards.catalog}
            values={propertyCards.values}
            canEdit={isAdmin}
            canEditCards={canEditCards}
            section="MIDDLE"
          />
            <PracticeDetailClient
              practice={practice as any}
              referrals={referrals as any}
              isAdmin={isAdmin}
              customProperties={customProperties}
            />
            </>
          }
          activities={
            <RecordActivityFeed
              recordType="PRACTICE"
              recordId={practice.id}
              items={activityItems as any}
              users={userOptions}
              canEdit={isAdmin}
              showActions={false}
            />
          }
        />
      }
      right={
        <RecordAssociationCards recordType="PRACTICE" recordId={practice.id} cards={assocCards} canEdit={isAdmin} />
      }
    />
  )
}
