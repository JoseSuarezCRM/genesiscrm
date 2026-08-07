import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { userCanLevel } from "@/lib/permissions"
import { listMediaAssets } from "@/app/actions/media"
import MediaLibrary from "@/components/media-library"

export default async function MediaPage() {
  const session = await auth()
  if (!userCanLevel(session?.user as any, "TEMPLATES", "EDIT")) redirect("/communications/email")
  const assets = await listMediaAssets()

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Media Library</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload images once and reuse them across email and document templates. Each image gets a public link that renders in the builder, in sent emails, and in generated PDFs.
        </p>
      </div>
      <MediaLibrary initial={assets} />
    </div>
  )
}
