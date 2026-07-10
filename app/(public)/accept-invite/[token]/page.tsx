import Link from "next/link"
import { Activity } from "lucide-react"
import { getInvite } from "@/app/actions/users"
import { PASSWORD_RULES } from "@/lib/password-policy"
import AcceptInviteForm from "@/components/accept-invite-form"

interface Props { params: { token: string } }

export default async function AcceptInvitePage({ params }: Props) {
  const invite = await getInvite(params.token)

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex justify-center mb-2 text-blue-600">
          <Activity className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-center text-slate-900">Genesis Ortho CRM</h1>

        {!invite ? (
          <div className="mt-6 text-center space-y-3">
            <p className="text-sm text-slate-600">
              This invitation link is invalid or has expired.
            </p>
            <p className="text-sm text-slate-500">Ask an administrator to send you a new invite.</p>
            <Link href="/login" className="inline-block text-sm text-blue-600 hover:underline">Go to sign in</Link>
          </div>
        ) : (
          <>
            <p className="text-center text-sm text-slate-500 mt-1">
              Set a password to activate your account
            </p>
            <p className="text-center text-xs text-slate-400 mt-1">{invite.email}</p>
            <AcceptInviteForm
              token={params.token}
              name={invite.name ?? ""}
              minLength={PASSWORD_RULES.minLength}
            />
          </>
        )}
      </div>
    </div>
  )
}
