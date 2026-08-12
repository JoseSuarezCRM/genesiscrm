"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Loader2, ArrowLeftRight } from "lucide-react"
import { createAssociationDef, deleteAssociationDef } from "@/app/actions/associations"
import StyledSelect from "@/components/ui/styled-select"
import { confirmDialog } from "@/components/ui/confirm-dialog"

interface Def { id: string; typeA: string; typeB: string; label: string | null; labelA: string; labelB: string }
interface ObjType { key: string; label: string }

const inputCls = "h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function DataModelSettings({ defs, types }: { defs: Def[]; types: ObjType[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [a, setA] = useState("")
  const [b, setB] = useState("")
  const [label, setLabel] = useState("")
  const [err, setErr] = useState("")

  function create(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    if (!a || !b) { setErr("Pick two objects."); return }
    startTransition(async () => {
      const res = await createAssociationDef(a, b, label)
      if ((res as any)?.error) { setErr((res as any).error); return }
      setA(""); setB(""); setLabel("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">New relationship</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-slate-600 block mb-1">Object</label>
            <StyledSelect value={a} onChange={(e) => setA(e.target.value)} className={inputCls + " w-full"}>
              <option value="">— Select —</option>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </StyledSelect>
          </div>
          <ArrowLeftRight className="h-4 w-4 text-slate-300 mb-2.5" />
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-slate-600 block mb-1">Related object</label>
            <StyledSelect value={b} onChange={(e) => setB(e.target.value)} className={inputCls + " w-full"}>
              <option value="">— Select —</option>
              {types.filter((t) => t.key !== a).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </StyledSelect>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-slate-600 block mb-1">Label (optional)</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls + " w-full"} placeholder="e.g. Attended" />
          </div>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button type="submit" disabled={isPending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add relationship
        </button>
      </form>

      {defs.length === 0 ? (
        <div className="bg-white border rounded-xl py-12 text-center text-slate-400">No relationships defined yet.</div>
      ) : (
        <div className="space-y-2">
          {defs.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0 text-sm text-slate-800 flex items-center gap-2 flex-wrap">
                <span className="font-medium">{d.labelA}</span>
                <ArrowLeftRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium">{d.labelB}</span>
                {d.label && <span className="text-xs text-slate-400">({d.label})</span>}
              </div>
              <button onClick={async () => { if (await confirmDialog("Remove this relationship?")) startTransition(async () => { await deleteAssociationDef(d.id); router.refresh() }) }}
                className="h-8 w-8 inline-flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
