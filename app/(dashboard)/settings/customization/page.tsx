import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PropertyCustomizationManager from "@/components/property-customization-manager"
import { getPropertyDisplays } from "@/app/actions/property-display"

export default async function CustomizationPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/")
  }

  const [referralProps, providerProps, practiceProps] = await Promise.all([
    getPropertyDisplays("REFERRAL"),
    getPropertyDisplays("PROVIDER"),
    getPropertyDisplays("PRACTICE"),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Property Customization</h1>
        <p className="text-sm text-slate-500 mt-1">
          Customize which properties appear on detail pages for each entity type
        </p>
      </div>

      <PropertyCustomizationManager
        referralProps={referralProps}
        providerProps={providerProps}
        practiceProps={practiceProps}
      />
    </div>
  )
}
