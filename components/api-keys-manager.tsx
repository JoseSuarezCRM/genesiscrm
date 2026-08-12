"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, Plus, Copy, Check, Loader2, Trash2, ShieldCheck, X, TriangleAlert } from "lucide-react"
import { createApiToken, revokeApiToken, deleteApiToken, type ApiTokenRow } from "@/app/actions/api-tokens"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import type { ApiScopeDef } from "@/lib/api-objects"
import { cn } from "@/lib/utils"

export default function ApiKeysManager({ initial, scopes: scopeDefs }: { initial: ApiTokenRow[]; scopes: ApiScopeDef[] }) {
  // Group scopes by object for the create form.
  const scopeGroups = scopeDefs.reduce<Record<string, ApiScopeDef[]>>((acc, s) => { (acc[s.group] ??= []).push(s); return acc }, {})
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function toggleScope(s: string) {
    setScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  function create() {
    setErr(null)
    startTransition(async () => {
      const res = await createApiToken(name, scopes)
      if (res.error) { setErr(res.error); return }
      setNewToken(res.token ?? null)
      setCreating(false); setName(""); setScopes([])
      router.refresh()
    })
  }

  async function revoke(id: string) {
    if (!(await confirmDialog("Revoke this key? Any system using it loses access immediately."))) return
    startTransition(async () => { await revokeApiToken(id); router.refresh() })
  }
  async function remove(id: string) {
    if (!(await confirmDialog("Delete this key permanently?"))) return
    startTransition(async () => { await deleteApiToken(id); router.refresh() })
  }
  function copy(t: string) { navigator.clipboard.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }

  return (
    <div className="space-y-4">
      {/* One-time token reveal */}
      {newToken && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <ShieldCheck className="h-4 w-4" /> Key created — copy it now
            <button onClick={() => setNewToken(null)} className="ml-auto text-emerald-700 hover:text-emerald-900"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-emerald-200 rounded-lg px-2.5 py-2 break-all">{newToken}</code>
            <button onClick={() => copy(newToken)} className="inline-flex items-center gap-1 h-8 px-2.5 text-xs border border-emerald-300 rounded-lg bg-white hover:bg-emerald-100">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-emerald-700 flex items-center gap-1"><TriangleAlert className="h-3 w-3" /> This is the only time the full key is shown. Store it in the consuming system now.</p>
        </div>
      )}

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* Create */}
      {creating ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Key name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zapier — Referrals sync" autoFocus
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Scopes</label>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {Object.entries(scopeGroups).map(([group, items]) => (
                <div key={group}>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{group}</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {items.map((s) => (
                      <label key={s.key} className={cn("flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer", scopes.includes(s.key) ? "border-blue-400 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50")}>
                        <input type="checkbox" checked={scopes.includes(s.key)} onChange={() => toggleScope(s.key)} className="mt-0.5 rounded border-slate-300" />
                        <span>
                          <span className="block text-sm font-medium text-slate-800">{s.label}</span>
                          <code className="text-[10px] text-slate-400">{s.key}</code>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setCreating(false); setErr(null) }} className="h-9 px-3 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
            <button onClick={create} disabled={pending || !name.trim() || scopes.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Create key
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Create API key
        </button>
      )}

      {/* List */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <th className="text-left font-semibold px-4 py-2.5">Name</th>
              <th className="text-left font-semibold px-4 py-2.5">Key</th>
              <th className="text-left font-semibold px-4 py-2.5">Scopes</th>
              <th className="text-left font-semibold px-4 py-2.5 whitespace-nowrap">Last used</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initial.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No API keys yet.</td></tr>
            ) : initial.map((t) => (
              <tr key={t.id} className={cn("hover:bg-slate-50/70", t.revoked && "opacity-50")}>
                <td className="px-4 py-3 font-medium text-slate-800">{t.name}{t.revoked && <span className="ml-2 text-[10px] uppercase text-red-600 font-semibold">revoked</span>}</td>
                <td className="px-4 py-3"><code className="text-xs text-slate-500">{t.prefix}••••</code></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {t.scopes.map((s) => <span key={s} className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5 font-mono">{s}</span>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "Never"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!t.revoked && <button onClick={() => revoke(t.id)} className="text-sm text-amber-600 hover:underline mr-3">Revoke</button>}
                  <button onClick={() => remove(t.id)} className="inline-flex items-center text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
