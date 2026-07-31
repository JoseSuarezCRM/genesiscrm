import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { userCan } from "@/lib/permissions"
import { listApiTokens } from "@/app/actions/api-tokens"
import ApiKeysManager from "@/components/api-keys-manager"

export default async function ApiKeysPage() {
  const session = await auth()
  if (!userCan(session?.user as any, "MANAGE_USERS")) redirect("/settings/integrations")
  const tokens = await listApiTokens()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/settings/integrations" className="inline-flex items-center text-xs text-slate-500 hover:text-slate-800 mb-3">
        <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Connected Apps
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">API Keys</h1>
        <p className="text-sm text-slate-500 mt-1">
          Keys for the CRM’s public API (<code className="text-xs">/api/v1</code>). Give a key only the scopes it needs. Calls authenticate with{" "}
          <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-4">
        These keys grant programmatic access to PHI. Share them only with systems under a BAA, keep scopes minimal, and revoke immediately if leaked.
      </div>
      <ApiKeysManager initial={tokens} />
    </div>
  )
}
