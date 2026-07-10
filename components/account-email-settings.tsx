"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mail, Loader2, Check, Send } from "lucide-react"
import { setMyEmailSending, sendMyTestEmail } from "@/app/actions/account"

export default function AccountEmailSettings({ email, enabled: initialEnabled }: { email: string; enabled: boolean }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setMsg(null)
    startTransition(async () => {
      const res = await setMyEmailSending(next)
      if ((res as any)?.error) { setEnabled(!next); setMsg({ kind: "err", text: (res as any).error }) }
      else router.refresh()
    })
  }

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
          Send emails from the app as your own address. No password or setup needed — it uses the
          organization's secure Microsoft 365 connection.
        </p>

        <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-zinc-900" : "bg-slate-300"} disabled:opacity-50`}
          >
            <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-[22px]" : "translate-x-0.5"}`} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">Send from my address</p>
            <p className="text-xs text-slate-500 truncate">{email}</p>
          </div>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </label>

        {enabled && (
          <div className="flex items-center gap-3">
            <button
              onClick={sendTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-slate-300 disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send test email
            </button>
            <span className="text-xs text-slate-400">to confirm it works</span>
          </div>
        )}

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
