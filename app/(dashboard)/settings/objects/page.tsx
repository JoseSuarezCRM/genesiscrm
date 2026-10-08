import { settingsPageOrRedirect } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { listCustomObjects } from "@/app/actions/custom-objects"
import { CP_ENTITIES } from "@/lib/custom-property-entities"
import { RECORD_FIELDS } from "@/lib/record-field-catalog"
import { delegateFor } from "@/lib/automation-records"
import { hasLockedProperties } from "@/lib/custom-object-locks"
import { canOpenSettingsPage } from "@/lib/settings-pages"
import ObjectsTabs from "@/components/objects-tabs"
import ObjectsSettings, { type ObjectRow } from "@/components/objects-settings"

export const dynamic = "force-dynamic"

// Objects → Objects tab: every object in the CRM, built-in and custom, with
// create / rename / delete for custom ones. Properties and pipelines are their
// own pages, linked from each row.
export default async function ObjectsSettingsPage({ searchParams }: { searchParams?: { key?: string } }) {
  const session = await settingsPageOrRedirect("objects")
  const user = session.user as any

  const [customs, cpCounts, coRecordCounts, pipelineCounts] = await Promise.all([
    listCustomObjects(),
    prisma.customProperty.groupBy({ by: ["entityType"], _count: { _all: true } }).catch(() => []),
    (prisma as any).customObjectRecord.groupBy({ by: ["objectDefId"], _count: { _all: true } }).catch(() => []),
    (prisma as any).pipeline.groupBy({ by: ["objectType"], where: { isActive: true }, _count: { _all: true } }).catch(() => []),
  ])
  const pipelinesOf = (type: string) => (pipelineCounts as any[]).find((p) => p.objectType === type)?._count._all ?? 0

  const builtins: ObjectRow[] = await Promise.all(CP_ENTITIES.map(async (e) => ({
    key: e.type,
    label: e.label,
    icon: e.icon,
    kind: "builtin" as const,
    propertyCount: (RECORD_FIELDS[e.type]?.length ?? 0) + ((cpCounts as any[]).find((c) => c.entityType === e.type)?._count._all ?? 0),
    recordCount: await delegateFor(e.type)?.count().catch(() => null) ?? null,
    // Only Referrals and custom objects can be in a pipeline.
    pipelineCount: e.type === "REFERRAL" ? pipelinesOf("REFERRAL") : null,
    listHref: `/${e.basePath}`,
  })))

  const custom: ObjectRow[] = customs.map((o) => ({
    key: `CO:${o.key}`,
    label: o.plural,
    icon: null,
    kind: "custom" as const,
    id: o.id,
    singular: o.singular,
    plural: o.plural,
    locked: hasLockedProperties(o.properties),
    propertyCount: o.properties.length,
    recordCount: (coRecordCounts as any[]).find((c) => c.objectDefId === o.id)?._count._all ?? 0,
    pipelineCount: pipelinesOf(`CO:${o.key}`),
    listHref: `/objects/${o.key}`,
  }))

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <ObjectsTabs active="objects" user={user} />
      <ObjectsSettings
        objects={[...builtins, ...custom]}
        canProperties={canOpenSettingsPage(user, "properties")}
        canPipelines={canOpenSettingsPage(user, "pipelines")}
        initialEditKey={searchParams?.key ? `CO:${searchParams.key}` : undefined}
      />
    </div>
  )
}
