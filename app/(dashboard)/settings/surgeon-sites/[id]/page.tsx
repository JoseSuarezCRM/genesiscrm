import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { getSurgeonSite } from "@/app/actions/surgeon-sites"
import { SurgeonSiteEditor } from "@/components/surgeon-site-editor"

export const dynamic = "force-dynamic"

export default async function SurgeonSiteDetailPage({ params }: { params: { id: string } }) {
  const site = await getSurgeonSite(params.id)
  if (!site) notFound()

  return (
    <div className="max-w-5xl">
      <Link
        href="/settings/surgeon-sites"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Surgeon Websites
      </Link>

      <SurgeonSiteEditor
        id={site.id}
        slug={site.slug}
        domain={site.domain}
        status={site.status}
        redirectUrl={site.redirectUrl}
        publishedAt={site.publishedAt ? new Date(site.publishedAt).toISOString() : null}
        lastDeployAt={site.lastDeployAt ? new Date(site.lastDeployAt).toISOString() : null}
        lastDeployOk={site.lastDeployOk ?? null}
        lastDeployError={site.lastDeployError ?? null}
        // Read here rather than in the client component: this is deployment
        // configuration, not content, and a NEXT_PUBLIC_ variable would bake it
        // into the browser bundle for no reason.
        previewUrl={(process.env.SURGEON_SITE_PREVIEW_URL ?? "").trim().replace(/\/+$/, "") || null}
        previewSecret={(process.env.SURGEON_SITE_PREVIEW_SECRET ?? "").trim() || null}
        content={site.content}
        missing={site.missing}
      />
    </div>
  )
}
