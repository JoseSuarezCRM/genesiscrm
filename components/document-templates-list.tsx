"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FileText, Plus, Trash2, Loader2, Pencil } from "lucide-react"
import { createDocumentTemplate, deleteDocumentTemplate } from "@/app/actions/document-templates"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"

interface Tpl { id: string; name: string; objectType: string; isActive: boolean; updatedAt: string }

export default function DocumentTemplatesList({ templates, objectTypes }: { templates: Tpl[]; objectTypes: { key: string; label: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState("")
  const [objectType, setObjectType] = useState(objectTypes[0]?.key ?? "")
  const [err, setErr] = useState<string | null>(null)
  const labelOf = (k: string) => objectTypes.find((o) => o.key === k)?.label ?? k

  function create() {
    setErr(null)
    start(async () => {
      const r = await createDocumentTemplate({ name, objectType })
      if (r.error) return setErr(r.error)
      router.push(`/communications/documents/${r.id}`)
    })
  }
  async function remove(id: string) {
    if (!(await confirmDialog("Delete this template?"))) return
    start(async () => { await deleteDocumentTemplate(id); router.refresh() })
  }

  const input = "h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"

  return (
    <div className="space-y-4">
      {/* New */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">Template name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Letter of Protection" className={cn(input, "block w-64 mt-1")} />
        </label>
        <label className="text-xs text-slate-500">For object
          <select value={objectType} onChange={(e) => setObjectType(e.target.value)} className={cn(input, "block w-48 mt-1 bg-white")}>
            {objectTypes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <button onClick={create} disabled={pending || !name.trim()} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} New template
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      {/* List */}
      <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {templates.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-400 text-center">No templates yet. Create one above.</p>
        ) : templates.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
            <Link href={`/communications/documents/${t.id}`} className="font-medium text-slate-800 hover:text-blue-600">{t.name}</Link>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{labelOf(t.objectType)}</span>
            {!t.isActive && <span className="text-xs text-amber-600">inactive</span>}
            <span className="ml-auto text-[11px] text-slate-400">Updated {new Date(t.updatedAt).toLocaleDateString()}</span>
            <Link href={`/communications/documents/${t.id}`} className="text-slate-400 hover:text-slate-700"><Pencil className="h-4 w-4" /></Link>
            <button onClick={() => remove(t.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
