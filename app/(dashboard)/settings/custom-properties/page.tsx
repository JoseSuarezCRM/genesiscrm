import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import CustomPropertiesPageClient from "@/components/custom-properties-page-client"
import { listCustomProperties } from "@/app/actions/custom-properties"

export default async function CustomPropertiesPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") {
    redirect("/")
  }

  const [referralProps, providerProps, practiceProps] = await Promise.all([
    listCustomProperties("REFERRAL"),
    listCustomProperties("PROVIDER"),
    listCustomProperties("PRACTICE"),
  ])

  return (
    <CustomPropertiesPageClient
      referralProps={referralProps}
      providerProps={providerProps}
      practiceProps={practiceProps}
    />
  )
}
