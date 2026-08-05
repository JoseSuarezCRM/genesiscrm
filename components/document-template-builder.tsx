"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2, ChevronUp, ChevronDown, Plus, Type, ImageIcon, Columns3, Minus, MoveVertical, FileDown, Save } from "lucide-react"
import { RichTextEditor, type TokenGroup } from "@/components/rich-text-editor"
import { updateDocumentTemplate } from "@/app/actions/document-templates"
import { getObjectTokenGroups } from "@/app/actions/record-activity"
import { makeBlock, type DocBlock, type BlockRegion, type BlockType, type Align, type ColumnChild } from "@/lib/document-blocks"
import { cn } from "@/lib/utils"

const REGIONS: { key: BlockRegion; label: string; hint: string }[] = [
  { key: "header", label: "Header", hint: "Repeats at the top of every page (logo, doctor list)." },
  { key: "body", label: "Body", hint: "The letter content." },
  { key: "footer", label: "Footer", hint: "Repeats at the bottom of every page (address)." },
]

const PALETTE: { type: BlockType; label: string; icon: any }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "columns", label: "Columns", icon: Columns3 },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: MoveVertical },
]

interface Props {
  template: { id: string; name: string; objectType: string; blocks: DocBlock[]; pageSize: string; isActive: boolean }
  objectTypes: { key: string; label: string }[]
}

export default function DocumentTemplateBuilder({ template, objectTypes }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState(template.name)
  const [objectType, setObjectType] = useState(template.objectType)
  const [pageSize, setPageSize] = useState(template.pageSize || "LETTER")
  const [isActive, setIsActive] = useState(template.isActive)
  const [blocks, setBlocks] = useState<DocBlock[]>(template.blocks)
  const [tokenGroups, setTokenGroups] = useState<TokenGroup[]>([])
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)
  const [previewing, setPreviewing] = useState(false)

  // Load the Fields menu tokens for the chosen object.
  useEffect(() => {
    let cancel = false
    getObjectTokenGroups(objectType).then((g) => { if (!cancel) setTokenGroups(g as TokenGroup[]) }).catch(() => {})
    return () => { cancel = true }
  }, [objectType])

  const flash = (text: string, ok = false) => setMsg({ text, ok })

  // ── Block mutations ──
  const updateTop = (id: string, patch: Partial<DocBlock>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as DocBlock) : b)))
  const removeTop = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id))
  const addTop = (type: BlockType, region: BlockRegion) => setBlocks((bs) => [...bs, makeBlock(type, region)])
  const move = (id: string, dir: -1 | 1) => setBlocks((bs) => {
    const b = bs.find((x) => x.id === id); if (!b) return bs
    const sameRegion = bs.filter((x) => x.region === b.region)
    const pos = sameRegion.findIndex((x) => x.id === id)
    const swapWith = sameRegion[pos + dir]; if (!swapWith) return bs
    const i = bs.indexOf(b), j = bs.indexOf(swapWith)
    const next = [...bs];[next[i], next[j]] = [next[j], next[i]]; return next
  })

  // Columns children
  const mutateCols = (colId: string, fn: (cols: ColumnChild[][]) => ColumnChild[][]) =>
    setBlocks((bs) => bs.map((b) => (b.id === colId && b.type === "columns" ? { ...b, columns: fn(b.columns) } : b)))
  const addColChild = (colId: string, ci: number, type: BlockType) =>
    mutateCols(colId, (cols) => cols.map((c, i) => (i === ci ? [...c, makeBlock(type === "columns" ? "text" : type) as ColumnChild] : c)))
  const updateColChild = (colId: string, ci: number, childId: string, patch: Partial<ColumnChild>) =>
    mutateCols(colId, (cols) => cols.map((c, i) => (i === ci ? c.map((ch) => (ch.id === childId ? ({ ...ch, ...patch } as ColumnChild) : ch)) : c)))
  const removeColChild = (colId: string, ci: number, childId: string) =>
    mutateCols(colId, (cols) => cols.map((c, i) => (i === ci ? c.filter((ch) => ch.id !== childId) : c)))
  const setColCount = (colId: string, count: number) =>
    mutateCols(colId, (cols) => { const next = [...cols]; while (next.length < count) next.push([]); return next.slice(0, count) })

  async function uploadAsset(file: File): Promise<string | null> {
    const fd = new FormData(); fd.append("file", file)
    const res = await fetch("/api/documents/asset-upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { flash(data.error ?? "Upload failed."); return null }
    return data.url as string
  }

  function save() {
    setMsg(null)
    start(async () => {
      const r = await updateDocumentTemplate(template.id, { name, objectType, blocks, pageSize, isActive })
      if (r.error) return flash(r.error)
      flash("Saved.", true); router.refresh()
    })
  }
  async function preview() {
    setMsg(null); setPreviewing(true)
    try {
      const res = await fetch("/api/documents/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks, pageSize }) })
      if (!res.ok) { flash((await res.json().catch(() => ({}))).error ?? "Preview failed."); return }
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), "_blank")
    } finally { setPreviewing(false) }
  }

  const input = "h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
  const alignSel = (v: Align | undefined, on: (a: Align) => void) => (
    <select value={v ?? "left"} onChange={(e) => on(e.target.value as Align)} className="h-7 px-1 text-xs border border-slate-200 rounded-md bg-white">
      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
    </select>
  )

  // ── Leaf editor (used at top level and inside columns) ──
  function LeafEditor({ b, onPatch, onUpload }: { b: ColumnChild; onPatch: (p: Partial<ColumnChild>) => void; onUpload: () => void }) {
    if (b.type === "text") return (
      <div className="space-y-1">
        <div className="flex items-center gap-2"><span className="text-[11px] text-slate-400">Text</span>{alignSel(b.align, (a) => onPatch({ align: a }))}</div>
        <RichTextEditor value={b.html} onChange={(html) => onPatch({ html })} tokenGroups={tokenGroups} minHeight={90} placeholder="Write text… use Fields to insert tokens" />
      </div>
    )
    if (b.type === "image") return (
      <div className="flex items-center gap-3">
        {b.url ? <img src={b.url} alt="" className="h-12 max-w-[140px] object-contain border border-slate-100 rounded" /> : <span className="text-xs text-slate-400">No image</span>}
        <button onClick={onUpload} className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50">{b.url ? "Replace" : "Upload"}</button>
        <label className="text-[11px] text-slate-500">Width<input type="number" value={b.width ?? 160} onChange={(e) => onPatch({ width: Number(e.target.value) || 160 })} className="block h-7 w-20 px-2 text-xs border border-slate-200 rounded-md" /></label>
        {alignSel(b.align, (a) => onPatch({ align: a }))}
      </div>
    )
    if (b.type === "divider") return <label className="text-[11px] text-slate-500 flex items-center gap-2">Divider · thickness<input type="number" value={b.thickness ?? 1} onChange={(e) => onPatch({ thickness: Number(e.target.value) || 1 })} className="h-7 w-16 px-2 text-xs border border-slate-200 rounded-md" /></label>
    if (b.type === "spacer") return <label className="text-[11px] text-slate-500 flex items-center gap-2">Spacer · height<input type="number" value={b.height ?? 16} onChange={(e) => onPatch({ height: Number(e.target.value) || 16 })} className="h-7 w-16 px-2 text-xs border border-slate-200 rounded-md" /></label>
    return null
  }

  // Hidden file input reused for uploads.
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<(url: string) => void>(() => {})
  const pickImage = (onUrl: (url: string) => void) => { uploadTarget.current = onUrl; fileRef.current?.click() }

  function BlockCard({ b }: { b: DocBlock }) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wide">{b.type}</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => move(b.id, -1)} className="hover:text-slate-700"><ChevronUp className="h-3.5 w-3.5" /></button>
            <button onClick={() => move(b.id, 1)} className="hover:text-slate-700"><ChevronDown className="h-3.5 w-3.5" /></button>
            <button onClick={() => removeTop(b.id)} className="hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {b.type === "columns" ? (
          <div className="space-y-2">
            <label className="text-[11px] text-slate-500">Columns<select value={b.columns.length} onChange={(e) => setColCount(b.id, Number(e.target.value))} className="ml-2 h-7 px-1 text-xs border border-slate-200 rounded-md bg-white"><option value={2}>2</option><option value={3}>3</option></select></label>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${b.columns.length}, minmax(0,1fr))` }}>
              {b.columns.map((col, ci) => (
                <div key={ci} className="rounded-md border border-dashed border-slate-200 p-2 space-y-2">
                  {col.map((ch) => (
                    <div key={ch.id} className="rounded border border-slate-100 p-2 space-y-1">
                      <div className="flex justify-end"><button onClick={() => removeColChild(b.id, ci, ch.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button></div>
                      <LeafEditor b={ch} onPatch={(p) => updateColChild(b.id, ci, ch.id, p)} onUpload={() => pickImage((url) => updateColChild(b.id, ci, ch.id, { url }))} />
                    </div>
                  ))}
                  <div className="flex gap-1">
                    {(["text", "image"] as BlockType[]).map((t) => (
                      <button key={t} onClick={() => addColChild(b.id, ci, t)} className="text-[11px] text-blue-600 hover:underline">+ {t}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <LeafEditor b={b as ColumnChild} onPatch={(p) => updateTop(b.id, p as Partial<DocBlock>)} onUpload={() => pickImage((url) => updateTop(b.id, { url } as Partial<DocBlock>))} />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (!f) return
        const url = await uploadAsset(f); if (url) uploadTarget.current(url)
      }} />

      {/* Header bar */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "block w-56 mt-1")} /></label>
        <label className="text-xs text-slate-500">Object<select value={objectType} onChange={(e) => setObjectType(e.target.value)} className={cn(input, "block w-44 mt-1 bg-white")}>{objectTypes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <label className="text-xs text-slate-500">Page<select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className={cn(input, "block w-28 mt-1 bg-white")}><option value="LETTER">Letter</option><option value="A4">A4</option><option value="LEGAL">Legal</option></select></label>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 pb-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300" /> Active</label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={preview} disabled={previewing} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">{previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Preview PDF</button>
          <button onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        </div>
      </div>
      {msg && <div className={cn("rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>{msg.text}</div>}
      <p className="text-[11px] text-slate-400">Preview shows the layout with tokens left as-is (e.g. {"{patient_name}"}). Generating from a real record fills them in.</p>

      {/* Regions */}
      {REGIONS.map((region) => {
        const regionBlocks = blocks.filter((b) => (b.region ?? "body") === region.key)
        return (
          <div key={region.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{region.label}</h3>
              <span className="text-[11px] text-slate-400">{region.hint}</span>
            </div>
            <div className="space-y-2">
              {regionBlocks.length === 0 && <p className="text-xs text-slate-400 italic">No blocks yet.</p>}
              {regionBlocks.map((b) => <BlockCard key={b.id} b={b} />)}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PALETTE.map((p) => (
                <button key={p.type} onClick={() => addTop(p.type, region.key)} className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                  <p.icon className="h-3 w-3" /> {p.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
