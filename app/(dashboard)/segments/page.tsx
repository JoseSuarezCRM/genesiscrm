import Link from "next/link"
import { Plus } from "lucide-react"
import { requireView } from "@/lib/auth-guard"
import { userCanLevel } from "@/lib/permissions"
import { listSegments } from "@/app/actions/segments"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import SegmentsClient from "@/components/segments-client"

export const dynamic = "force-dynamic"

export default async function SegmentsPage() {
  const session = await requireView("SEGMENTS")
  const user = session?.user as any
  const canEdit = userCanLevel(user, "SEGMENTS", "EDIT")

  const [segments, shareOptions] = await Promise.all([listSegments(), getViewShareOptions()])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Segments</h1>
          <p className="text-sm text-zinc-500">
            {segments.length} segment{segments.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canEdit && (
          <Link
            href="/segments/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            Create segment
          </Link>
        )}
      </div>

      <SegmentsClient
        segments={segments as any}
        canEdit={canEdit}
        shareUsers={shareOptions.users as any}
        shareTeams={shareOptions.teams as any}
      />
    </div>
  )
}
