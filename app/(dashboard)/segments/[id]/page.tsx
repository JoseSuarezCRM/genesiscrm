import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { labelFor } from "@/lib/object-registry"
import { fieldsFor } from "@/lib/object-fields-server"
import { getSegment, segmentMembers, importSegmentCounts } from "@/app/actions/segments"
import { segmentSummary } from "@/lib/segments"
import SegmentDetail from "@/components/segment-detail"

export const dynamic = "force-dynamic"

interface PageProps { params: { id: string }; searchParams: { page?: string } }

export default async function SegmentDetailPage({ params, searchParams }: PageProps) {
  const session = await requireView("SEGMENTS")
  const user = session?.user as any

  const segment = await getSegment(params.id)
  if (!segment) notFound()

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1)
  const [defs, objectLabel, members] = await Promise.all([
    fieldsFor(segment.objectType),
    labelFor(segment.objectType),
    // The detail page always recomputes live — this is the page where the
    // number has to be right, so it never shows the cached size.
    segmentMembers(params.id, page, 50),
  ])
  const summary = await segmentSummary(segment as any, defs).catch(() => "")
  // Only meaningful for an import-sourced segment; null otherwise.
  const importCounts = await importSegmentCounts(params.id).catch(() => null)

  return (
    <div className="p-6 space-y-5">
      <Link href="/segments" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Segments
      </Link>

      <SegmentDetail
        segment={JSON.parse(JSON.stringify(segment))}
        objectLabel={objectLabel}
        summary={summary}
        members={JSON.parse(JSON.stringify(members))}
        importCounts={importCounts}
        canEdit={userCanLevel(user, "SEGMENTS", "EDIT")}
      />
    </div>
  )
}
