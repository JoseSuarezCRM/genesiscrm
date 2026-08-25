import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { requireView } from "@/lib/auth-guard"
import { getReportForView, getReportsList } from "@/app/actions/saved-reports"
import { getViewShareOptions } from "@/app/actions/view-share-options"
import ReportViewerClient from "@/components/report-viewer-client"

export default async function ReportViewPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) redirect("/login")
  await requireView("REPORTS")

  const [report, siblings, shareOptions] = await Promise.all([
    getReportForView(params.id),
    getReportsList(),
    getViewShareOptions(),
  ])
  if (!report) notFound()

  const nav = siblings.map((r) => ({ id: r.id, name: r.name }))
  return <ReportViewerClient report={report} siblings={nav} shareUsers={shareOptions.users} />
}
