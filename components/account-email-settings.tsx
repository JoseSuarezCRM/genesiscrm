"use client"

import { useState } from "react"
import { Mail, Loader2, Check, Send } from "lucide-react"
import { sendMyTestEmail } from "@/app/actions/account"

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
      </div>
    </div>
  )
}
