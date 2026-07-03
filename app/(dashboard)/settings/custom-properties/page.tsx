import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import CustomPropertyManager from "@/components/custom-property-manager"
import { listCustomProperties } from "@/app/actions/custom-properties"

export default async function CustomPropertiesPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/")
  }

  const [referralProps, providerProps, practiceProps, locationProps] = await Promise.all([
    listCustomProperties("REFERRAL"),
    listCustomProperties("PROVIDER"),
    listCustomProperties("PRACTICE"),
    listCustomProperties("LOCATION"),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Custom Properties</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create and manage custom fields for referrals, providers, practices, and locations
        </p>
      </div>

      <CustomPropertyManager
        referralProps={referralProps}
        providerProps={providerProps}
        practiceProps={practiceProps}
        locationProps={locationProps}
      />
    </div>
  )
}
