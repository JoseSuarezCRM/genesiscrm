"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, FolderSearch, ListChecks, CalendarClock, Loader2, Power, PlayCircle, ShieldAlert, CheckCircle2, Trash2, Mail } from "lucide-react"
import { saveFaConnection, saveFaImportConfig, setFaEnabled, testFaConnection, loadFaColumns, runFaImportNow, importFaFile, importAllFaFiles, resetFaImport, saveFaReportConfig, sendFaReportNow, type FaSettings } from "@/app/actions/filesanywhere"
import { cn } from "@/lib/utils"

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}` }))

export default function FilesanywhereConfig({ settings }: { settings: FaSettings }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)

  // Connection (SFTP)
  const [host, setHost] = useState(settings.host || "connect.filesanywhere.com")
  const [port, setPort] = useState(String(settings.port || 22))
  const [userName, setUserName] = useState(settings.userName ?? "")
  const [password, setPassword] = useState("")

  // Source + target + mapping + schedule
  const [folderPath, setFolderPath] = useState(settings.folderPath || "/Kcloud/")
  const [filenamePattern, setFilenamePattern] = useState(settings.filenamePattern || "SFTPsalesforce*.csv")
  const [objectSlug, setObjectSlug] = useState(settings.objectSlug)
  const [providerObjectSlug, setProviderObjectSlug] = useState(settings.providerObjectSlug)
  const [providerMatchProp, setProviderMatchProp] = useState(settings.providerMatchProp)
  const [providerMap, setProviderMap] = useState<Record<string, string>>(settings.providerMap ?? {})
  const [appointmentMap, setAppointmentMap] = useState<Record<string, string>>(settings.appointmentMap ?? {})
  const [frequency, setFrequency] = useState<"daily" | "weekly">(settings.frequency ?? "weekly")
  const [dayOfWeek, setDayOfWeek] = useState(settings.dayOfWeek ?? 1)
  const [hour, setHour] = useState(settings.hour ?? 6)
  const [columns, setColumns] = useState<string[]>([])
  type Entry = { name: string; modified: string | null; dir: boolean; imported: boolean; matches: boolean }
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [matched, setMatched] = useState(0)
  const [importing, setImporting] = useState<string | null>(null)

  // Weekly report
  const [reportEnabled, setReportEnabled] = useState(settings.report.enabled)
  const [reportRecipients, setReportRecipients] = useState((settings.report.recipients ?? []).join(", "))
  const [reportDay, setReportDay] = useState(settings.report.dayOfWeek ?? 1)
  const [reportHour, setReportHour] = useState(settings.report.hour ?? 8)
  const [reportProvFields, setReportProvFields] = useState<string[]>(settings.report.providerFields ?? [])
  const [reportApptFields, setReportApptFields] = useState<string[]>(settings.report.appointmentFields ?? [])

  const selectedObject = settings.objects.find((o) => o.slug === objectSlug)
  const selectedProviderObject = settings.objects.find((o) => o.slug === providerObjectSlug)
  const colOptions = <><option value="">—</option>{columns.map((c) => <option key={c} value={c}>{c}</option>)}</>
  const flash = (text: string, ok = false) => setMsg({ text, ok })

  function saveConnection() {
    setMsg(null)
    start(async () => {
      const r = await saveFaConnection({ host, port: Number(port) || 22, userName, password: password || undefined })
      if (r.error) return flash(r.error)
      setPassword(""); flash("Connection saved.", true); router.refresh()
    })
  }
  function test(pathOverride?: string) {
    const p = pathOverride ?? folderPath
    setMsg(null); setEntries(null)
    start(async () => {
      const r = await testFaConnection(p)
      if (r.error) return flash(r.error)
      setEntries(r.entries ?? []); setMatched(r.matched ?? 0)
      flash(`${r.entries?.length ?? 0} item(s) in ${r.path} · ${r.matched ?? 0} match the pattern.`, true)
    })
  }
  // Drill into a folder from the listing (builds an absolute path from root).
  function openFolder(name: string) {
    const base = folderPath.replace(/\/+$/, "")
    const child = base === "" || base === "/" ? `/${name}` : `${base}/${name}`
    setFolderPath(child)
    test(child)
  }
  function goUp() {
    const base = folderPath.replace(/\/+$/, "")
    const parent = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) || "/" : "/"
    setFolderPath(parent)
    test(parent)
  }
  function loadCols() {
    setMsg(null)
    start(async () => {
      const r = await loadFaColumns(folderPath, filenamePattern)
      if (r.error) return flash(r.error)
      setColumns(r.columns ?? []); flash(`Loaded ${r.columns?.length ?? 0} columns from ${r.file}.`, true)
    })
  }
  function saveMapping() {
    setMsg(null)
    start(async () => {
      const r = await saveFaImportConfig({ folderPath, filenamePattern, objectSlug, providerObjectSlug, providerMatchProp, providerMap, appointmentMap, frequency, dayOfWeek, hour })
      if (r.error) return flash(r.error)
      flash("Import settings saved.", true); router.refresh()
    })
  }
  const reportConfig = () => ({
    enabled: reportEnabled,
    recipients: reportRecipients.split(",").map((s) => s.trim()).filter(Boolean),
    dayOfWeek: reportDay, hour: reportHour,
    providerFields: reportProvFields, appointmentFields: reportApptFields,
  })
  function saveReport() {
    setMsg(null)
    start(async () => {
      const r = await saveFaReportConfig(reportConfig())
      if (r.error) return flash(r.error)
      flash("Report settings saved.", true); router.refresh()
    })
  }
  function sendReport() {
    setMsg(null)
    start(async () => {
      // Save the current form first so "Send now" uses what you just entered.
      const saved = await saveFaReportConfig(reportConfig())
      if (saved.error) return flash(saved.error)
      const r = await sendFaReportNow()
      if (r.error) return flash(r.error)
      flash(r.message ?? "Sent.", true); router.refresh()
    })
  }
  // Column pickers: empty selection = all columns (default). First uncheck
  // materializes the full list minus that one.
  const toggleField = (id: string, allIds: string[], list: string[], setList: (v: string[]) => void) => {
    const base = list.length === 0 ? allIds : list
    setList(base.includes(id) ? base.filter((x) => x !== id) : [...base, id])
  }
  function reset() {
    if (!confirm("Delete every record created by the import (all records in the referring-providers and appointments objects, plus any legacy imported providers)? This can't be undone.")) return
    setMsg(null)
    start(async () => {
      const r = await resetFaImport()
      if (r.error) return flash(r.error)
      flash(r.message ?? "Reset done.", true); router.refresh()
    })
  }
  // Import a single file (historical backfill), from whatever folder is being browsed.
  function importFile(name: string, force = false) {
    setMsg(null); setImporting(name)
    start(async () => {
      const r = await importFaFile(name, folderPath, force)
      setImporting(null)
      if (r.error) return flash(r.error)
      if (r.skipped) return flash(`${name} was already imported — nothing to do.`, true)
      setEntries((prev) => prev?.map((e) => (e.name === name ? { ...e, imported: true } : e)) ?? prev)
      flash(`Imported ${name}: ${r.appointmentsCreated} appointments, ${r.providersCreated} new providers.`, true)
    })
  }
  // Import every matching file in the browsed folder that isn't imported yet.
  function importAll() {
    setMsg(null); setImporting("__all__")
    start(async () => {
      const r = await importAllFaFiles(folderPath)
      setImporting(null)
      if (r.error) return flash(r.error)
      setEntries((prev) => prev?.map((e) => (e.matches ? { ...e, imported: true } : e)) ?? prev)
      flash(r.message ?? "Done.", true)
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
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">SFTP connection</h3>{settings.connected && <span className="ml-auto text-xs text-emerald-600 font-medium">Saved</span>}</div>
        <p className="text-xs text-slate-500">FilesAnywhere SFTP (connect.filesanywhere.com:22). Standard username + password, stored encrypted.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="SFTP host" className={input} />
          <input value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port" className={input} />
          <input value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Username" className={input} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings.hasPassword ? "Password (saved)" : "Password"} className={input} />
        </div>
        <div className="flex gap-2">
          <button onClick={saveConnection} disabled={pending} className="h-9 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">Save connection</button>
          <button onClick={() => test()} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSearch className="h-3.5 w-3.5" />} Test / browse</button>
        </div>
        {entries && (
          <div className="text-xs text-slate-600 border-t border-slate-100 pt-2 max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-100">
              <span className="font-mono text-slate-400">{folderPath || "/"}</span>
              <button onClick={goUp} className="text-blue-600 hover:underline">↑ up</button>
            </div>
            {entries.length === 0 ? "This folder is empty." : entries.map((e) => (
              e.dir ? (
                <button key={e.name} onClick={() => openFolder(e.name)} className="w-full flex justify-between py-0.5 hover:bg-slate-50 rounded px-1 text-left">
                  <span className="font-mono text-blue-700">📁 {e.name}</span>
                  <span className="text-slate-400">{e.modified ? new Date(e.modified).toLocaleDateString() : ""}</span>
                </button>
              ) : (
                <div key={e.name} className="flex items-center gap-2 py-0.5 px-1 group">
                  <span className="font-mono flex-1 min-w-0 truncate">📄 {e.name}</span>
                  {e.imported && <span className="inline-flex items-center gap-0.5 text-emerald-600 shrink-0"><CheckCircle2 className="h-3 w-3" /> imported</span>}
                  <span className="text-slate-400 shrink-0 w-16 text-right">{e.modified ? new Date(e.modified).toLocaleDateString() : ""}</span>
                  {e.matches && (
                    <button
                      onClick={() => importFile(e.name, e.imported)}
                      disabled={pending || !settings.objectSlug || !settings.providerObjectSlug}
                      title={!settings.objectSlug || !settings.providerObjectSlug ? "Save both objects & mapping first" : e.imported ? "Re-import this file" : "Import this file"}
                      className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {importing === e.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                      {e.imported ? "Re-import" : "Import"}
                    </button>
                  )}
                </div>
              )
            ))}
            {matched > 0 && (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <button
                  onClick={importAll}
                  disabled={pending || !settings.objectSlug || !settings.providerObjectSlug}
                  title={!settings.objectSlug || !settings.providerObjectSlug ? "Save both objects & mapping first" : "Import every matching file not yet imported (oldest first)"}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40"
                >
                  {importing === "__all__" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />} Import all matching
                </button>
                <span className="text-emerald-600">✓ {matched} file(s) here match the pattern.</span>
              </div>
            )}
            {matched === 0 && entries.some((e) => e.dir) && <p className="text-amber-600 mt-1">Click a 📁 folder to go into it.</p>}
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
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block text-xs text-slate-500">Create appointments in
            <select value={objectSlug} onChange={(e) => setObjectSlug(e.target.value)} className={sel}>
              <option value="">Select a custom object…</option>
              {settings.objects.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-500">Create referring providers in
            <select value={providerObjectSlug} onChange={(e) => { setProviderObjectSlug(e.target.value); setProviderMatchProp(""); setProviderMap({}) }} className={sel}>
              <option value="">Select a custom object…</option>
              {settings.objects.map((o) => <option key={o.slug} value={o.slug}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-slate-400">Appointments are associated to the matching referring provider automatically (using the association you defined in the data model).</p>
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
            {/* Referring providers */}
            {selectedProviderObject ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{selectedProviderObject.label} fields</p>
                  <label className="ml-auto text-[11px] text-slate-500 inline-flex items-center gap-1">De-dupe on
                    <select value={providerMatchProp} onChange={(e) => setProviderMatchProp(e.target.value)} className="h-6 px-1 text-xs border border-slate-200 rounded-md bg-white">
                      <option value="">(no de-dupe)</option>
                      {selectedProviderObject.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {selectedProviderObject.properties.map((p) => (
                    <label key={p.id} className="text-xs text-slate-500">{p.name}{p.id === providerMatchProp ? " (match key)" : ""}
                      <select value={providerMap[p.id] ?? ""} onChange={(e) => setProviderMap({ ...providerMap, [p.id]: e.target.value })} className={sel}>{colOptions}</select>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">Map your NPI column to a property and pick it as the de-dupe key so an existing provider is reused instead of duplicated.</p>
              </>
            ) : (
              <p className="text-xs text-amber-600">Pick your referring-providers object in “Create referring providers in” above to map its fields here.</p>
            )}
            {/* Appointments */}
            {selectedObject ? (
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
            ) : (
              <p className="text-xs text-amber-600 mt-2">Pick your appointments object in “Create appointments in” above to map its fields here.</p>
            )}
          </>
        )}
      </div>

      {/* 4. Schedule */}
      <div className={card}>
        <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">Schedule</h3></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">Pull
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")} className={sel + " w-28"}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          {frequency === "weekly" && (
            <label className="text-xs text-slate-500">on
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={sel + " w-36"}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-500">at
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={sel + " w-28"}>
              {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </label>
          <span className="text-[11px] text-slate-400 pb-2">America/Chicago</span>
        </div>
        {settings.lastRunAt && <p className="text-[11px] text-slate-400">Last run {new Date(settings.lastRunAt).toLocaleString()}{settings.lastImportedFile ? ` · last file ${settings.lastImportedFile}` : ""}</p>}
      </div>

      {/* 5. Weekly report */}
      <div className={card}>
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">Weekly report</h3>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-700">Enabled
            <button onClick={() => setReportEnabled((v) => !v)} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", reportEnabled ? "bg-emerald-500" : "bg-slate-300")}>
              <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", reportEnabled ? "translate-x-4" : "translate-x-0.5")} />
            </button>
          </label>
        </div>
        <p className="text-xs text-slate-500">Emails a table of referring providers created in the last 7 days, each with their appointment info.</p>
        <label className="block text-xs text-slate-500">Recipients (comma-separated)
          <input value={reportRecipients} onChange={(e) => setReportRecipients(e.target.value)} placeholder="name@genesisortho.com, other@…" className={input} />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">Send weekly on
            <select value={reportDay} onChange={(e) => setReportDay(Number(e.target.value))} className={sel + " w-36"}>
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">at
            <select value={reportHour} onChange={(e) => setReportHour(Number(e.target.value))} className={sel + " w-28"}>
              {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </label>
          <span className="text-[11px] text-slate-400 pb-2">America/Chicago</span>
        </div>

        {/* Which columns to include (empty = all). */}
        {(selectedProviderObject || selectedObject) && (
          <div className="grid sm:grid-cols-2 gap-3 border-t border-slate-100 pt-2">
            {selectedProviderObject && (() => {
              const allIds = selectedProviderObject.properties.map((p) => p.id)
              return (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Referring provider columns</p>
                  <div className="space-y-0.5">
                    {selectedProviderObject.properties.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" className="rounded border-slate-300"
                          checked={reportProvFields.length === 0 || reportProvFields.includes(p.id)}
                          onChange={() => toggleField(p.id, allIds, reportProvFields, setReportProvFields)} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })()}
            {selectedObject && (() => {
              const allIds = selectedObject.properties.map((p) => p.id)
              return (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Appointment columns</p>
                  <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                    {selectedObject.properties.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" className="rounded border-slate-300"
                          checked={reportApptFields.length === 0 || reportApptFields.includes(p.id)}
                          onChange={() => toggleField(p.id, allIds, reportApptFields, setReportApptFields)} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={saveReport} disabled={pending} className="h-8 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">Save report settings</button>
          <button onClick={sendReport} disabled={pending} className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Mail className="h-4 w-4" /> Send report now</button>
          {settings.report.lastSentAt && <span className="text-[11px] text-slate-400 ml-auto">Last sent {new Date(settings.report.lastSentAt).toLocaleString()}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={saveMapping} disabled={pending} className="h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">Save settings</button>
        <button onClick={importNow} disabled={pending || !settings.connected} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><PlayCircle className="h-4 w-4" /> Import now</button>
        <button onClick={reset} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete all imported records so you can re-import cleanly"><Trash2 className="h-4 w-4" /> Reset imported data</button>
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
