"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Plus, Send, Trash2, PenLine } from "lucide-react"
import SignatureEditorModal from "@/components/signature-editor-modal"
import Switch from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { showToast, showErrorToast } from "@/components/toast"
import { saveOrgSignature, type SignatureState } from "@/app/actions/email-signatures"
import {
  createSharedMailbox, deleteSharedMailbox, testSharedMailbox, updateSharedMailbox,
} from "@/app/actions/shared-mailboxes"

export interface MailboxRow {
  id: string
  email: string
  label: string
  signatureHtml: string | null
  enabled: boolean
  legacyKey: string | null
}

export default function EmailSettingsManager({
  orgSignature,
  mailboxes,
}: {
  orgSignature: SignatureState
  mailboxes: MailboxRow[]
}) {
  return (
    <div className="space-y-6">
      <OrgSignatureCard initial={orgSignature} />
      <MailboxesCard rows={mailboxes} />
    </div>
  )
}

function OrgSignatureCard({ initial }: { initial: SignatureState }) {
  const [html, setHtml] = useState(initial.html)
  const [editing, setEditing] = useState(false)

  const save = async (next: string): Promise<boolean> => {
    try {
      await saveOrgSignature({ html: next, enabled: true })
      setHtml(next)
      showToast("Organization signature saved.")
      return true
    } catch {
      showErrorToast("Couldn't save the signature.")
      return false
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-base font-semibold text-slate-900">Organization signature</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          The fallback for everyone. It's used whenever a sender has no signature of their own — including
          automated mail and scheduled reports. Outlook signatures can't be imported; Microsoft provides no
          way to read them.
        </p>
      </div>
      <div className="flex items-center gap-3 p-5">
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-slate-300"
        >
          <PenLine className="h-3.5 w-3.5" />
          {html.trim() ? "Edit signature" : "Create signature"}
        </button>
        <span className="text-xs text-slate-400">
          {html.trim() ? "Set — opens in a full window" : "Not set yet"}
        </span>
      </div>

      <SignatureEditorModal
        open={editing}
        onClose={() => setEditing(false)}
        title="Organization signature"
        subtitle="Used whenever a sender has no signature of their own, including automated mail."
        initialHtml={html}
        onSave={save}
      />
    </section>
  )
}

function MailboxesCard({ rows }: { rows: MailboxRow[] }) {
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState("")
  const [label, setLabel] = useState("")
  const [pending, start] = useTransition()

  const add = () => {
    start(async () => {
      const res = await createSharedMailbox({ email, label })
      if ((res as any)?.error) { showErrorToast((res as any).error); return }
      setEmail(""); setLabel(""); setAdding(false)
      showToast("Mailbox added — send a test to confirm it works.")
    })
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Shared mailboxes</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Addresses the CRM can send as, each with its own signature. Mail sent from one signs off as
            that mailbox — including when a person picks it as their sender.
          </p>
        </div>
        <button
          onClick={() => setAdding((a) => !a)}
          className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-slate-300"
        >
          <Plus className="h-3.5 w-3.5" /> Add mailbox
        </button>
      </div>

      {adding && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Address</label>
            <input
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@genesisortho.com"
              className="h-9 w-72 rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Name</label>
            <input
              value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Billing"
              className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>
          <button
            onClick={add} disabled={pending || !email.trim()}
            className="h-9 px-3 rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add"}
          </button>
          <p className="basis-full text-xs text-slate-400">
            The mailbox must already exist in Microsoft 365. Send a test afterwards — an address that
            can't be sent as will otherwise fail silently inside a scheduled job.
          </p>
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No shared mailboxes yet.</p>
        ) : (
          rows.map((m) => <MailboxRowView key={m.id} row={m} />)
        )}
      </div>
    </section>
  )
}

function MailboxRowView({ row }: { row: MailboxRow }) {
  const [editing, setEditing] = useState(false)
  const [pending, start] = useTransition()
  // Held locally so the switch answers immediately: the server action revalidates
  // the page, but waiting for that round trip makes the toggle feel stuck.
  // Reverted if the write fails, so it never shows a state the server doesn't have.
  const [enabled, setEnabled] = useState(row.enabled)
  useEffect(() => setEnabled(row.enabled), [row.enabled])

  const toggleEnabled = (next: boolean) => {
    setEnabled(next)
    start(async () => {
      try {
        await updateSharedMailbox(row.id, { enabled: next })
        showToast(next ? `${row.email} can now be used as a sender.` : `${row.email} is no longer offered as a sender.`)
      } catch {
        setEnabled(!next)
        showErrorToast("Couldn't change that mailbox.")
      }
    })
  }

  const saveSignature = async (html: string): Promise<boolean> => {
    try {
      await updateSharedMailbox(row.id, { signatureHtml: html })
      showToast(`Signature saved for ${row.email}.`)
      return true
    } catch {
      showErrorToast("Couldn't save the signature.")
      return false
    }
  }

  const test = () => {
    start(async () => {
      const res = await testSharedMailbox(row.id)
      if ((res as any)?.error) showErrorToast((res as any).error)
      else showToast(`Test sent to ${(res as any).sentTo}.`)
    })
  }

  const remove = async () => {
    if (!(await confirmDialog(
      `Remove ${row.email}? Workflows and sequences set to send from it will fall back to the first mailbox.`
    ))) return
    start(async () => {
      try {
        await deleteSharedMailbox(row.id)
        showToast(`${row.email} removed.`)
      } catch {
        showErrorToast("Couldn't remove that mailbox.")
      }
    })
  }

  const hasOwn = !!row.signatureHtml?.trim()

  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className={cn("min-w-0 flex-1", !enabled && "opacity-50")}>
        <div className="text-sm font-medium text-slate-900 truncate">{row.email}</div>
        <div className="text-xs text-slate-400">
          {row.label}
          {enabled
            ? hasOwn ? " · has its own signature" : " · uses the organization signature"
            : " · not offered as a sender"}
        </div>
      </div>

      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:border-slate-300"
      >
        <PenLine className="h-3 w-3" />
        {hasOwn ? "Edit signature" : "Add signature"}
      </button>

      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          disabled={pending}
          label={`${enabled ? "Disable" : "Enable"} ${row.email}`}
          onChange={toggleEnabled}
        />
        <span className={cn("w-8 text-xs font-medium", enabled ? "text-slate-600" : "text-slate-400")}>
          {enabled ? "On" : "Off"}
        </span>
      </div>
      <button
        onClick={test} disabled={pending} title="Send a test to yourself"
        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => void remove()} disabled={pending} title="Remove"
        className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <SignatureEditorModal
        open={editing}
        onClose={() => setEditing(false)}
        title={row.email}
        subtitle="Leave blank to use the organization signature."
        initialHtml={row.signatureHtml ?? ""}
        onSave={saveSignature}
      />
    </div>
  )
}
