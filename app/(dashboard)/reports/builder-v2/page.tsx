import { redirect } from "next/navigation"

// The v2 builder now lives at /reports/builder. Keep this path working for old
// links/bookmarks by redirecting (preserving the ?report= param).
export default function ReportBuilderV2Redirect({ searchParams }: { searchParams: { report?: string } }) {
  redirect(searchParams.report ? `/reports/builder?report=${searchParams.report}` : "/reports/builder")
}
