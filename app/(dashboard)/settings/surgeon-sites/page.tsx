import { listSurgeonSites } from "@/app/actions/surgeon-sites"
import { SurgeonSitesManager } from "@/components/surgeon-sites-manager"

export const dynamic = "force-dynamic"

export default async function SurgeonSitesPage() {
  const sites = await listSurgeonSites()

  return (
    <div className="max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Surgeon Websites</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Each of our surgeons&apos; public websites. Content is written here; the sites themselves run
          separately and read only what has been published, so editing never changes what is live.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          <span className="font-medium">Credentials belong to one surgeon.</span> Training,
          fellowships, team-physician work and publication records must be filled in for each surgeon
          individually. A site can&apos;t be published until they are — publishing one surgeon&apos;s
          credentials under another&apos;s name is a false statement about a physician.
        </p>
      </div>

      <div className="mt-6">
        <SurgeonSitesManager initial={sites} />
      </div>
    </div>
  )
}
