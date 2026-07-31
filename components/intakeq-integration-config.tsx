"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Webhook, Loader2, Copy, Check, ShieldAlert, Power, CalendarClock } from "lucide-react"
import { saveIntakeqApiKey, generateWebhookSecret, setIntakeqEnabled, disconnectIntakeq, saveIntakeqSchedule, type IntegrationSettings } from "@/app/actions/intakeq"
import { INTAKE_WINDOWS, type IntakeWindow } from "@/lib/intakeq-weeks"
import { cn } from "@/lib/utils"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}` }))

export default function IntakeqIntegrationConfig({ settings }: { settings: IntegrationSettings }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [keyInput, setKeyInput] = useState("")
  const [editingKey, setEditingKey] = useState(!settings.apiKeyHint)
  const [err, setErr] = useState<string | null>(null)
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Scheduled pull
  const [frequency, setFrequency] = useState<"daily" | "weekly">(settings.frequency)
  const [dayOfWeek, setDayOfWeek] = useState(settings.dayOfWeek)
  const [hour, setHour] = useState(settings.hour)
  const [win, setWin] = useState<IntakeWindow>(settings.window)
  const [schedMsg, setSchedMsg] = useState<string | null>(null)

  const origin = typeof window !== "undefined" ? window.location.origin : ""

  function saveSchedule() {
    setSchedMsg(null)
    startTransition(async () => {
      const r = await saveIntakeqSchedule({ frequency, dayOfWeek, hour, window: win })
      if (r.error) { setErr(r.error); return }
      setSchedMsg("Schedule saved."); router.refresh()
    })
  }

  function saveKey() {
    setErr(null)
    startTransition(async () => {
      const res = await saveIntakeqApiKey(keyInput)
      if (res.error) { setErr(res.error); return }
      setKeyInput(""); setEditingKey(false); router.refresh()
    })
  }

  function genSecret() {
    setErr(null)
    startTransition(async () => {
      const res = await generateWebhookSecret()
      if (res.error) { setErr(res.error); return }
      setWebhookUrl(`${origin}/api/webhooks/intakeq?token=${res.secret}`)
      router.refresh()
    })
  }

  function toggle(enabled: boolean) {
    startTransition(async () => { await setIntakeqEnabled(enabled); router.refresh() })
  }

  function disconnect() {
    if (!confirm("Remove the stored IntakeQ API key and disable the integration? Your saved data stays.")) return
    startTransition(async () => { await disconnectIntakeq(); setEditingKey(true); router.refresh() })
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  const card = "rounded-xl border border-slate-200 bg-white p-4"

  return (
    <div className="space-y-4 max-w-2xl">
      {!settings.encryptionReady && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-700">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <code className="text-xs">ENCRYPTION_KEY</code> isn’t set on the server — set it in Vercel before saving a key.
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* API key */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">API key</h3>
          {settings.connected && <span className="ml-auto text-xs text-emerald-600 font-medium">Connected</span>}
        </div>
        <p className="text-xs text-slate-500 mb-3">Stored encrypted (AES-256-GCM). From IntakeQ → Settings → Integrations → Developer API.</p>
        {settings.apiKeyHint && !editingKey ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-slate-700">{settings.apiKeyHint}</span>
            <button onClick={() => setEditingKey(true)} className="text-sm text-blue-600 hover:underline">Rotate</button>
            <button onClick={disconnect} className="text-sm text-red-600 hover:underline ml-auto">Disconnect</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste IntakeQ API key"
              className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
            <button onClick={saveKey} disabled={pending || !keyInput.trim() || !settings.encryptionReady}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
            </button>
            {settings.apiKeyHint && <button onClick={() => { setEditingKey(false); setKeyInput("") }} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>}
          </div>
        )}
      </div>

      {/* Webhook */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <Webhook className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Webhook</h3>
          {settings.hasWebhookSecret && <span className="ml-auto text-xs text-slate-500">Secret set</span>}
        </div>
        <p className="text-xs text-slate-500 mb-3">Paste this URL into IntakeQ’s “Intake Form Webhook URL” so submissions flow in live.</p>
        {webhookUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 break-all">{webhookUrl}</code>
              <button onClick={() => copy(webhookUrl)} className="inline-flex items-center gap-1 h-8 px-2.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-amber-600">Copy it now — the secret is shown only once. Use your production domain when you go live.</p>
          </div>
        ) : (
          <button onClick={genSecret} disabled={pending}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
            {settings.hasWebhookSecret ? "Regenerate secret & URL" : "Generate secret & URL"}
          </button>
        )}
      </div>

      {/* Scheduled pull */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <CalendarClock className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Scheduled pull</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">The webhook captures submissions live; this reconciliation pass re-scans a date window to catch anything it missed. Choose when it runs and which window to re-pull.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">Pull
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")} className="block h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white w-28 focus:outline-none focus:border-zinc-400">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          {frequency === "weekly" && (
            <label className="text-xs text-slate-500">on
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="block h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white w-36 focus:outline-none focus:border-zinc-400">
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-500">at
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="block h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white w-28 focus:outline-none focus:border-zinc-400">
              {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">re-pull
            <select value={win} onChange={(e) => setWin(e.target.value as IntakeWindow)} className="block h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white w-44 focus:outline-none focus:border-zinc-400">
              {INTAKE_WINDOWS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </label>
          <span className="text-[11px] text-slate-400 pb-2.5">America/Chicago</span>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button onClick={saveSchedule} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save schedule
          </button>
          {schedMsg && <span className="text-xs text-emerald-600">{schedMsg}</span>}
          {settings.lastRunAt && <span className="text-[11px] text-slate-400 ml-auto">Last run {new Date(settings.lastRunAt).toLocaleString()}</span>}
        </div>
      </div>

      {/* Enable */}
      <div className={cn(card, "flex items-center justify-between")}>
        <div className="flex items-center gap-2">
          <Power className="h-4 w-4 text-slate-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Integration enabled</h3>
            <p className="text-xs text-slate-500">When off, no API calls are made and the webhook is rejected.</p>
          </div>
        </div>
        <button onClick={() => toggle(!settings.enabled)} disabled={pending || !settings.apiKeyHint}
          className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40", settings.enabled ? "bg-emerald-500" : "bg-slate-300")}>
          <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", settings.enabled ? "translate-x-5" : "translate-x-0.5")} />
        </button>
      </div>
    </div>
  )
}
