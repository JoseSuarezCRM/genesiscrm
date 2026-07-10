import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AccountEmailSettings from "@/components/account-email-settings"

export default async function AccountSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { name: true, email: true, role: true, emailSendingEnabled: true },
  })
  if (!user) redirect("/login")

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Account</h1>
        <p className="text-sm text-slate-500">{user.name ?? user.email}</p>
      </div>

      <AccountEmailSettings
        email={user.email}
        enabled={user.emailSendingEnabled}
      />
    </div>
  )
}
