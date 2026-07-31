"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, FolderSearch, ListChecks, CalendarClock, Loader2, Power, PlayCircle, ShieldAlert, CheckCircle2 } from "lucide-react"
import { saveFaConnection, saveFaImportConfig, setFaEnabled, testFaConnection, loadFaColumns, runFaImportNow, faDiagnostics, type FaSettings } from "@/app/actions/filesanywhere"
import { cn } from "@/lib/utils"

const INTERVALS = [
  { value: 360, label: "Every 6 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
]
const PROVIDER_FIELDS: { key: keyof NonNullable<FaSettings["providerMap"]>; label: string }[] = [
  { key: "npi", label: "NPI (match key)" },
  { key: "name", label: "Provider name" },
  { key: "phone", label: "Provider phone" },
  { key: "officePhone", label: "Referring phone / fax" },
]

export default function FilesanywhereConfig({ settings }: { settings: FaSettings }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)

  // Connection
  const [apiKey, setApiKey] = useState("")
  const [clientId, setClientId] = useState(String(settings.clientId ?? ""))
  const [userName, setUserName] = useState(settings.userName ?? "")
  const [password, setPassword] = useState("")

  // Source + target + mapping + schedule
  const [folderPath, setFolderPath] = useState(settings.folderPath || "Kcloud/")
  const [filenamePattern, setFilenamePattern] = useState(settings.filenamePattern || "SFTPsalesforce*.csv")
  const [objectSlug, setObjectSlug] = useState(settings.objectSlug)
  const [providerMap, setProviderMap] = useState(settings.providerMap ?? {})
  const [appointmentMap, setAppointmentMap] = useState<Record<string, string>>(settings.appointmentMap ?? {})
  const [intervalMinutes, setIntervalMinutes] = useState(settings.intervalMinutes)
  const [columns, setColumns] = useState<string[]>([])
  const [files, setFiles] = useState<{ name: string; modified: string | null }[] | null>(null)
  const [diag, setDiag] = useState<any>(null)

  const selectedObject = settings.objects.find((o) => o.slug === objectSlug)
  const colOptions = <><option value="">—</option>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</>
  const flash = (text: string, ok = false) => setMsg({ text, ok })

  function saveConnection() {
    setMsg(null)
    start(async () => {
      const r = await saveFaConnection({ apiKey: apiKey || undefined, clientId: Number(clientId), userName, password: password || undefined })
      if (r.error) return flash(r.error)
      setApiKey(""); setPassword(""); flash("Connection saved.", true); router.refresh()
    })
  }
  function test() {
    setMsg(null); setFiles(null)
    start(async () => {
      const r = await testFaConnection()
      if (r.error) return flash(r.error)
      setFiles(r.files ?? []); flash(`Connected — found ${r.files?.length ?? 0} matching file(s).`, true)
    })
  }
  function loadCols() {
    setMsg(null)
    start(async () => {
      const r = await loadFaColumns()
      if (r.error) return flash(r.error)
      setColumns(r.columns ?? []); flash(`Loaded ${r.columns?.length ?? 0} columns from ${r.file}.`, true)
    })
  }
  function saveMapping() {
    setMsg(null)
    start(async () => {
      const r = await saveFaImportConfig({ folderPath, filenamePattern, objectSlug, providerMap, appointmentMap, intervalMinutes })
      if (r.error) return flash(r.error)
      flash("Import settings saved.", true); router.refresh()
    })
  }
  function diagnose() {
    setMsg(null); setDiag(null)
    start(async () => {
      const r = await faDiagnostics()
      if (r.error) return flash(r.error)
      setDiag(r.result)
    })
  }
  function toggle(enabled: boolean) { start(async () => { await setFaEnabled(enabled); router.refresh() }) }
  function importNow() {
    setMsg(null)
    start(async () => {
      const r = await runFaImportNow()
      if (r.error) return flash(r.error)
      if (r.skipped) return flash(`Newest file already imported${r.file ? ` (${r.file})` : ""}.`, true)
      flash(`Imported ${r.file}: ${r.appointmentsCreated} appointments, ${r.providersCreated} new providers.`, true); router.refresh()
    })
  }

  const card = "rounded-xl border border-slate-200 bg-white p-4 space-y-3"
  const input = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
  const sel = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400"

  return (
    <div className="space-y-4 max-w-3xl">
      {!settings.encryptionReady && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-700">
          <ShieldAlert className="h-4 w-4 shrink-0" /> <code className="text-xs">ENCRYPTION_KEY</code> isn’t set — set it in Vercel before saving credentials.
        </div>
      )}
      {msg && <div className={cn("rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>{msg.text}</div>}

      {/* 1. Connection */}
      <div className={card}>
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">Connection</h3>{settings.connected && <span className="ml-auto text-xs text-emerald-600 font-medium">Saved</span>}</div>
        <p className="text-xs text-slate-500">Developer API key + a non-MFA account login. Stored encrypted.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.apiKeyHint ? `API key (${settings.apiKeyHint})` : "Developer API key"} className={input} />
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID (org id)" className={input} />
          <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Username" className={input} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings.hasPassword ? "Password (saved)" : "Password"} className={input} />
        </div>
        <div className="flex gap-2">
          <button onClick={saveConnection} disabled={pending} className="h-9 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">Save connection</button>
          <button onClick={test} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSearch className="h-3.5 w-3.5" />} Test connection</button>
          <button onClick={diagnose} disabled={pending} className="h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">Diagnose</button>
        </div>
        {diag && <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-72">{JSON.stringify(diag, null, 2)}</pre>}
        {files && (
          <div className="text-xs text-slate-600 border-t border-slate-100 pt-2">
            {files.length === 0 ? "No matching files." : files.map((f) => <div key={f.name} className="flex justify-between"><span className="font-mono">{f.name}</span><span className="text-slate-400">{f.modified ? new Date(f.modified).toLocaleDateString() : ""}</span></div>)}
          </div>
        )}
      </div>

      {/* 2. Source + target */}
      <div className={card}>
        <div className="flex items-center gap-2"><FolderSearch className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">Source &amp; target</h3></div>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">Folder path<input value={folderPath} onChange={(e) => setFolderPath(e.target.value)} className={input} /></label>
          <label className="text-xs text-slate-500">Filename pattern<input value={filenamePattern} onChange={(e) => setFilenamePattern(e.target.value)} className={input} /></label>
        </div>
        <label className="block text-xs text-slate-500">Create appointments in
          <select value={objectSlug} onChange={(e) => setObjectSlug(e.target.value)} className={sel}>
            <option value="">Select a custom object…</option>
            {settings.objects.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* 3. Mapping */}
      <div className={card}>
        <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">Column mapping</h3>
          <button onClick={loadCols} disabled={pending} className="ml-auto inline-flex items-center gap-1 h-7 px-2 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">{pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Load columns from newest file</button>
        </div>
        {columns.length === 0 ? (
          <p className="text-xs text-slate-400">Click “Load columns” to pull the header row, then map fields below.</p>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Referring provider (matched by NPI)</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PROVIDER_FIELDS.map((f) => (
                <label key={f.key} className="text-xs text-slate-500">{f.label}
                  <select value={(providerMap as any)[f.key] ?? ""} onChange={(e) => setProviderMap({ ...providerMap, [f.key]: e.target.value })} className={sel}>{colOptions}</select>
                </label>
              ))}
            </div>
            {selectedObject && (
              <>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mt-2">{selectedObject.label} fields</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {selectedObject.properties.map((p) => (
                    <label key={p.id} className="text-xs text-slate-500">{p.name}
                      <select value={appointmentMap[p.id] ?? ""} onChange={(e) => setAppointmentMap({ ...appointmentMap, [p.id]: e.target.value })} className={sel}>{colOptions}</select>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 4. Schedule */}
      <div className={card}>
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">Schedule</h3></div>
        <label className="block text-xs text-slate-500">Pull automatically
          <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} className={sel + " sm:w-48"}>
            {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </label>
        {settings.lastRunAt && <p className="text-[11px] text-slate-400">Last run {new Date(settings.lastRunAt).toLocaleString()}{settings.lastImportedFile ? ` · last file ${settings.lastImportedFile}` : ""}</p>}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={saveMapping} disabled={pending} className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Save settings</button>
        <button onClick={importNow} disabled={pending || !settings.connected} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><PlayCircle className="h-4 w-4" /> Import now</button>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-slate-700">
          <Power className="h-4 w-4 text-slate-400" /> Enabled
          <button onClick={() => toggle(!settings.enabled)} disabled={pending || !settings.connected} className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40", settings.enabled ? "bg-emerald-500" : "bg-slate-300")}>
            <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform", settings.enabled ? "translate-x-5" : "translate-x-0.5")} />
          </button>
        </label>
      </div>
    </div>
  )
}
