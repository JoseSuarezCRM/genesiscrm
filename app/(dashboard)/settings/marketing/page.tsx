import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { listCategories, listMarketingOrders, getMarketingConfig } from "@/app/actions/marketing"
import MarketingManager from "@/components/marketing-manager"
import { ExternalLink } from "lucide-react"

export default async function MarketingSettingsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const [categories, orders, config] = await Promise.all([
    listCategories(),
    listMarketingOrders(),
    getMarketingConfig(),
  ])

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing Materials</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage printable materials and incoming orders.</p>
        </div>
        <a
          href="/resources"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-all"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View public page
        </a>
      </div>

      <MarketingManager
        categories={categories}
        orders={orders}
        notifyEmail={config.notifyEmail}
      />
    </div>
  )
}
