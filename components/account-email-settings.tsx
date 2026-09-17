"use client"

import { useEffect, useState } from "react"
import { Mail, Loader2, Check, Send, PenLine } from "lucide-react"
import { sendMyTestEmail } from "@/app/actions/account"
import { getMySignature, saveMySignature } from "@/app/actions/email-signatures"
import SignatureEditorModal from "@/components/signature-editor-modal"
import { showErrorToast } from "@/components/toast"

export default function AccountEmailSettings({ email }: { email: string }) {
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  async function sendTest() {
    setTesting(true); setMsg(null)
    const res = await sendMyTestEmail()
    setTesting(false)
    if ((res as any)?.error) setMsg({ kind: "err", text: (res as any).error })
    else setMsg({ kind: "ok", text: `Test email sent to ${email}. Check your inbox.` })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Mail className="h-4 w-4 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">Email</h2>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-slate-600">
          When you send an email from a record, it goes out from your own address —
          <span className="font-medium text-slate-800"> {email}</span> — using the organization's
          secure Microsoft 365 connection. No password or setup needed.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={sendTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-slate-300 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send test email
          </button>
          <span className="text-xs text-slate-400">confirm sending from your address works</span>
        </div>

        {msg && (
          <p className={`text-sm px-3 py-2 rounded-md flex items-center gap-1.5 ${msg.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {msg.kind === "ok" && <Check className="h-4 w-4" />}
            {msg.text}
          </p>
        )}

        <MySignature />
      </div>
    </div>
  )
}

/**
 * The personal signature, and the toggle that falls back to the organization
 * default instead.
 *
 * This does not and cannot sync with Outlook: Microsoft has no API for reading a
 * signature — they live in the Outlook client, not the mailbox — so anything
 * sent from the CRM has to carry a signature we store. The copy says so, because
 * "why doesn't it match my Outlook one" is the obvious next question.
 */
function MySignature() {
  const [html, setHtml] = useState("")
  const [useOrg, setUseOrg] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    getMySignature()
      .then((s) => { setHtml(s.html); setUseOrg(!s.enabled) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const persist = async (nextHtml: string, nextUseOrg: boolean): Promise<boolean> => {
    try {
      await saveMySignature({ html: nextHtml, enabled: !nextUseOrg })
      setHtml(nextHtml)
      return true
    } catch {
      showErrorToast("Couldn't save your signature.")
      return false
    }
  }

  if (loading) {
    return (
      <div className="border-t border-slate-100 pt-4 text-sm text-slate-400 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading signature…
      </div>
    )
  }

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Email signature</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Added to the bottom of email you send from the CRM. This is separate from your Outlook
          signature — Microsoft gives us no way to read that one, so it has to be set up here.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={useOrg}
          onChange={(e) => { setUseOrg(e.target.checked); void persist(html, e.target.checked) }}
          className="h-4 w-4 rounded border-slate-300"
        />
        Use the organization default instead
      </label>

      {!useOrg && (
        <div className="flex items-center gap-3">
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
      )}

      <SignatureEditorModal
        open={editing}
        onClose={() => setEditing(false)}
        title="Your email signature"
        subtitle="Added to the bottom of email you send from the CRM."
        initialHtml={html}
        onSave={(next) => persist(next, useOrg)}
      />
    </div>
  )
}
