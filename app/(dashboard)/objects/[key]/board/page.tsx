import { redirect } from "next/navigation"

// The board is a view type on the list page now. Kept as a redirect so old links,
// bookmarks and the revalidatePath calls in app/actions/stages.ts still resolve.
export default function ObjectBoardRedirect({ params, searchParams }: {
  params: { key: string }
  searchParams: { pipeline?: string }
}) {
  const qs = new URLSearchParams({ view: "board" })
  if (searchParams.pipeline) qs.set("pipeline", searchParams.pipeline)
  redirect(`/objects/${params.key}?${qs.toString()}`)
}
