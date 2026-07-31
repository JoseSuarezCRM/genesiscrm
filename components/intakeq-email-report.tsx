"use client"

import { useState, useTransition } from "react"
import { Mail, Loader2, X } from "lucide-react"
import { sendReferralReportEmail } from "@/app/actions/intakeq"

export default function IntakeqEmailReport({ defaultStart, defaultEnd }: { defaultStart: string; defaultEnd: string }) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const [recipients, setRecipients] = useState("")
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  function send() {
    setMsg(null); setOk(false)
    const list = recipients.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    startTransition(async () => {
      const res = await sendReferralReportEmail({ startDate: start, endDate: end, recipients: list })
      if (res.error) { setMsg(res.error); return }
      setOk(true); setMsg(`Sent to ${res.sent} recipient${res.sent === 1 ? "" : "s"}.`)
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
        <Mail className="h-3.5 w-3.5" /> Email report
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 animate-modal-in">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Email referral report</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-500">Sends a per-day table — categories × days with row and column totals — for the range below (English + Spanish combined).</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">From</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">To</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Recipients (comma-separated)</label>
              <input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="jane@genesisortho.com, ops@genesisortho.com"
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            </div>
            {msg && <p className={`text-xs ${ok ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setOpen(false)} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-900">Close</button>
              <button onClick={send} disabled={pending || !recipients.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
