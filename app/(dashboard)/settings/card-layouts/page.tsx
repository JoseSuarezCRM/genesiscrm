import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import CardLayoutManager from "@/components/card-layout-manager"
import { getCardLayoutsForEntity } from "@/app/actions/card-layouts"

export default async function CardLayoutsPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/")
  }

  const [referralLayouts, providerLayouts, practiceLayouts] = await Promise.all([
    getCardLayoutsForEntity("REFERRAL"),
    getCardLayoutsForEntity("PROVIDER"),
    getCardLayoutsForEntity("PRACTICE"),
  ])

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Card Layout Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Customize which fields appear on each card in detail pages
        </p>
      </div>

      {/* Referrals */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          📋 Referrals
        </h2>
        <CardLayoutManager cardLayouts={referralLayouts} entityType="REFERRAL" />
      </div>

      {/* Providers */}
      <div className="border-t pt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          👨‍⚕️ Providers
        </h2>
        <CardLayoutManager cardLayouts={providerLayouts} entityType="PROVIDER" />
      </div>

      {/* Practices */}
      <div className="border-t pt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          🏥 Practices
        </h2>
        <CardLayoutManager cardLayouts={practiceLayouts} entityType="PRACTICE" />
      </div>
    </div>
  )
}
