import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getOrgSignature } from "@/app/actions/email-signatures"
import { listMailboxesForSettings } from "@/app/actions/shared-mailboxes"
import EmailSettingsManager, { type MailboxRow } from "@/components/email-settings-manager"

export default async function EmailSettingsPage() {
  const session = await auth()
  if ((session?.user as any)?.role !== "ADMIN") redirect("/")

  // listMailboxesForSettings seeds the original three on first open, so this page
  // is also what migrates the old env-var senders into rows.
  const [orgSignature, mailboxes] = await Promise.all([
    getOrgSignature(),
    listMailboxesForSettings(),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email</h1>
        <p className="text-sm text-slate-500">
          Signatures and the mailboxes the CRM can send from.
        </p>
      </div>
      <EmailSettingsManager orgSignature={orgSignature} mailboxes={mailboxes as MailboxRow[]} />
    </div>
  )
}
