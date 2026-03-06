import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getEmbedNotificationUsers } from "@/app/actions/embed-notifications"
import EmbedFormSettings from "@/components/embed-form-settings"

export default async function EmbedPage() {
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== "ADMIN") {
    redirect("/")
  }

  const headersList = await headers()
  const host = headersList.get("host") ?? "your-domain.com"
  const proto = host.includes("localhost") ? "http" : "https"
  const baseUrl = `${proto}://${host}`

  const users = await getEmbedNotificationUsers()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Embeddable Referral Form</h1>
        <p className="text-sm text-slate-500">
          Embed this form on your website so referring providers can submit referrals directly into the tracker.
        </p>
      </div>
      <EmbedFormSettings baseUrl={baseUrl} users={users} />
    </div>
  )
}
