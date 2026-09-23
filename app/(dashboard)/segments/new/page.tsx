import { redirect } from "next/navigation"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { recordPermKey } from "@/lib/record-perm-key"
import { listObjectTypes } from "@/lib/object-registry"
import { fieldsFor } from "@/lib/object-fields-server"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import { listImportRunsForSegments } from "@/app/actions/segments"
import SegmentBuilder from "@/components/segment-builder"

export const dynamic = "force-dynamic"

interface PageProps { searchParams: { object?: string; importRun?: string } }

export default async function NewSegmentPage({ searchParams }: PageProps) {
  const session = await requireView("SEGMENTS")
  const user = session?.user as any
  if (!userCanLevel(user, "SEGMENTS", "EDIT")) redirect("/segments")

  // Only objects this person can actually read — a segment dereferences records,
  // so offering an object they can't open would build a segment they can't use.
  const all = await listObjectTypes()
  const objects = all.filter((o) => userCanLevel(user, recordPermKey(o.key), "VIEW"))

  const objectType = searchParams.object && objects.some((o) => o.key === searchParams.object)
    ? searchParams.object
    : null

  const [defs, shareOptions, importRuns] = await Promise.all([
    objectType ? fieldsFor(objectType) : Promise.resolve([]),
    getViewShareOptions(),
    listImportRunsForSegments(),
  ])

  return (
    <div className="p-6">
      <SegmentBuilder
        objects={objects}
        objectType={objectType}
        objectLabel={objects.find((o) => o.key === objectType)?.label ?? ""}
        filterDefs={defs}
        shareUsers={shareOptions.users as any}
        shareTeams={shareOptions.teams as any}
        importRuns={importRuns as any}
        initialImportRun={searchParams.importRun ?? null}
      />
    </div>
  )
}
