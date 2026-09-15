"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus, Send, Trash2, ChevronDown, ChevronRight } from "lucide-react"
import SignatureEditor from "@/components/signature-editor"
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
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await saveOrgSignature({ html, enabled: true })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {
      showErrorToast("Couldn't save the signature.")
    } finally {
      setSaving(false)
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
      <div className="p-5">
        <SignatureEditor value={html} onChange={(v) => { setHtml(v); setSaved(false) }} onSave={save} saving={saving} saved={saved} />
      </div>
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
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState(row.signatureHtml ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await updateSharedMailbox(row.id, { signatureHtml: html })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch {
      showErrorToast("Couldn't save the signature.")
    } finally {
      setSaving(false)
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

  return (
    <div>
      <div className="px-5 py-3 flex items-center gap-3">
        <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-900 truncate">{row.email}</div>
          <div className="text-xs text-slate-400">
            {row.label}
            {row.signatureHtml?.trim() ? " · has its own signature" : " · uses the organization signature"}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox" checked={row.enabled} className="h-3.5 w-3.5 rounded border-slate-300"
            onChange={(e) => start(async () => { await updateSharedMailbox(row.id, { enabled: e.target.checked }) })}
          />
          Available
        </label>
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
      </div>

      {open && (
        <div className="px-5 pb-5 pl-12">
          <p className="text-xs text-slate-400 mb-2">
            Leave blank to use the organization signature.
          </p>
          <SignatureEditor
            value={html} onChange={(v) => { setHtml(v); setSaved(false) }}
            onSave={save} saving={saving} saved={saved} minHeight={120}
          />
        </div>
      )}
    </div>
  )
}
