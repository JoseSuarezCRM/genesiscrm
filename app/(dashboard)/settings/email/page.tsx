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
  //
  // Loading is guarded because this page is the only way to reach the mailbox
  // list: if it throws, an admin gets an opaque 500 with nothing to act on and no
  // way to fix the data that caused it. Showing the reason is worth more than a
  // blank page — and this route is admin-only, so the detail isn't sensitive.
  let orgSignature: { html: string; enabled: boolean }
  let mailboxes: MailboxRow[]
  try {
    ;[orgSignature, mailboxes] = await Promise.all([
      getOrgSignature(),
      listMailboxesForSettings() as Promise<MailboxRow[]>,
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Email</h1>
          <p className="text-sm text-slate-500">Signatures and the mailboxes the CRM can send from.</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">This page couldn&apos;t load</p>
          <p className="mt-1 text-sm text-red-800">
            The email settings failed to read. Everything else in the app is unaffected — sending still
            uses whatever is already configured.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs text-red-900">{message}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Email</h1>
        <p className="text-sm text-slate-500">
          Signatures and the mailboxes the CRM can send from.
        </p>
      </div>
      <EmailSettingsManager orgSignature={orgSignature} mailboxes={mailboxes} />
    </div>
  )
}
