"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, FileDown, Save, Type, ImageIcon, Columns3, Minus, MoveVertical, ArrowLeft } from "lucide-react"
import { RichTextEditor, type TokenGroup } from "@/components/rich-text-editor"
import { updateDocumentTemplate } from "@/app/actions/document-templates"
import { getObjectTokenGroups } from "@/app/actions/record-activity"
import { makeBlock as makeDocBlock, type DocBlock, type BlockType, type BlockRegion, type Align, type ColumnChild } from "@/lib/document-blocks"
import { renderDocBlockPreview } from "@/lib/document-preview"
import BlockCanvasBuilder, { type PaletteItem, type CanvasRegion } from "@/components/block-canvas-builder"
import { cn } from "@/lib/utils"

const PALETTE: PaletteItem[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "columns", label: "Columns", icon: Columns3 },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: MoveVertical },
]
const REGIONS: CanvasRegion[] = [
  { key: "header", label: "Header", hint: "repeats on every page" },
  { key: "body", label: "Body" },
  { key: "footer", label: "Footer", hint: "repeats on every page" },
]

interface Props {
  template: { id: string; name: string; objectType: string; blocks: DocBlock[]; pageSize: string; isActive: boolean }
  objectTypes: { key: string; label: string }[]
}

export default function DocumentTemplateBuilder({ template, objectTypes }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [name, setName] = useState(template.name)
  const [objectType, setObjectType] = useState(template.objectType)
  const [pageSize, setPageSize] = useState(template.pageSize || "LETTER")
  const [isActive, setIsActive] = useState(template.isActive)
  const [blocks, setBlocks] = useState<DocBlock[]>(template.blocks)
  const [tokenGroups, setTokenGroups] = useState<TokenGroup[]>([])
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)

  useEffect(() => {
    let cancel = false
    getObjectTokenGroups(objectType).then((g) => { if (!cancel) setTokenGroups(g as TokenGroup[]) }).catch(() => {})
    return () => { cancel = true }
  }, [objectType])

  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<(url: string) => void>(() => {})
  const pickImage = (onUrl: (url: string) => void) => { uploadTarget.current = onUrl; fileRef.current?.click() }
  async function uploadAsset(file: File): Promise<string | null> {
    const fd = new FormData(); fd.append("file", file)
    const res = await fetch("/api/documents/asset-upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ text: data.error ?? "Upload failed." }); return null }
    return data.url as string
  }

  function save() {
    setMsg(null); setSaving(true)
    ;(async () => {
      const r = await updateDocumentTemplate(template.id, { name, objectType, blocks, pageSize, isActive })
      setSaving(false)
      if (r.error) return setMsg({ text: r.error })
      setMsg({ text: "Saved.", ok: true }); router.refresh()
    })()
  }
  async function preview() {
    setMsg(null); setPreviewing(true)
    try {
      const res = await fetch("/api/documents/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ blocks, pageSize }) })
      if (!res.ok) { setMsg({ text: (await res.json().catch(() => ({}))).error ?? "Preview failed." }); return }
      window.open(URL.createObjectURL(await res.blob()), "_blank")
    } finally { setPreviewing(false) }
  }

  const alignSel = (v: Align | undefined, on: (a: Align) => void) => (
    <select value={v ?? "left"} onChange={(e) => on(e.target.value as Align)} className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white w-full">
      <option value="left">Align left</option><option value="center">Align center</option><option value="right">Align right</option>
    </select>
  )
  const field = "w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-zinc-400"
  const lbl = "block text-[11px] text-slate-500"

  function LeafSettings(b: ColumnChild, patch: (p: Partial<ColumnChild>) => void) {
    if (b.type === "text") return (
      <div className="space-y-2">
        <RichTextEditor value={b.html} onChange={(html) => patch({ html })} tokenGroups={tokenGroups} minHeight={120} placeholder="Write text… use Fields for tokens" />
        {alignSel(b.align, (a) => patch({ align: a }))}
      </div>
    )
    if (b.type === "image") return (
      <div className="space-y-2">
        {b.url && <img src={b.url} alt="" className="max-h-24 max-w-full object-contain border border-slate-100 rounded" />}
        <button onClick={() => pickImage((url) => patch({ url }))} className="h-8 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 w-full">{b.url ? "Replace image" : "Upload image"}</button>
        <label className={lbl}>Width (px)<input type="number" value={b.width ?? 160} onChange={(e) => patch({ width: Number(e.target.value) || 160 })} className={field} /></label>
        {alignSel(b.align, (a) => patch({ align: a }))}
      </div>
    )
    if (b.type === "divider") return <label className={lbl}>Thickness (px)<input type="number" value={b.thickness ?? 1} onChange={(e) => patch({ thickness: Number(e.target.value) || 1 })} className={field} /></label>
    if (b.type === "spacer") return <label className={lbl}>Height (px)<input type="number" value={b.height ?? 16} onChange={(e) => patch({ height: Number(e.target.value) || 16 })} className={field} /></label>
    return null
  }

  function renderSettings(b: DocBlock, patch: (p: Partial<DocBlock>) => void) {
    if (b.type !== "columns") return LeafSettings(b as ColumnChild, patch as any)
    const setCol = (fn: (cols: ColumnChild[][]) => ColumnChild[][]) => patch({ columns: fn(b.columns) } as any)
    return (
      <div className="space-y-3">
        <label className={lbl}>Columns
          <select value={b.columns.length} onChange={(e) => { const c = Number(e.target.value); setCol((cols) => { const n = [...cols]; while (n.length < c) n.push([]); return n.slice(0, c) }) }} className={field}>
            <option value={2}>2</option><option value={3}>3</option>
          </select>
        </label>
        {b.columns.map((col, ci) => (
          <div key={ci} className="rounded-md border border-slate-200 p-2 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500">Column {ci + 1}</p>
            {col.map((ch) => (
              <div key={ch.id} className="rounded border border-slate-100 p-2 space-y-1">
                <div className="flex items-center justify-between"><span className="text-[10px] text-slate-400 uppercase">{ch.type}</span>
                  <button onClick={() => setCol((cols) => cols.map((c, i) => (i === ci ? c.filter((x) => x.id !== ch.id) : c)))} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
                </div>
                {LeafSettings(ch, (p) => setCol((cols) => cols.map((c, i) => (i === ci ? c.map((x) => (x.id === ch.id ? { ...x, ...p } as ColumnChild : x)) : c))))}
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {(["text", "image"] as BlockType[]).map((t) => (
                <button key={t} onClick={() => setCol((cols) => cols.map((c, i) => (i === ci ? [...c, makeDocBlock(t) as ColumnChild] : c)))} className="text-[11px] text-blue-600 hover:underline">+ {t}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (!f) return; const url = await uploadAsset(f); if (url) uploadTarget.current(url)
      }} />

      <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 px-4 py-2.5 shrink-0">
        <button onClick={() => router.push("/communications/documents")} className="inline-flex items-center gap-1 h-9 px-2 text-sm text-slate-500 hover:text-slate-800 pb-2"><ArrowLeft className="h-4 w-4" /> Close</button>
        <label className="text-xs text-slate-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className="block w-52 mt-1 h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
        <label className="text-xs text-slate-500">Object<select value={objectType} onChange={(e) => setObjectType(e.target.value)} className="block w-44 mt-1 h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white">{objectTypes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
        <label className="text-xs text-slate-500">Page<select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="block w-28 mt-1 h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white"><option value="LETTER">Letter</option><option value="A4">A4</option><option value="LEGAL">Legal</option></select></label>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 pb-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-slate-300" /> Active</label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={preview} disabled={previewing} className="inline-flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">{previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Preview PDF</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        </div>
      </div>
      {msg && <div className={cn("mx-4 mt-2 rounded-lg border px-3 py-2 text-sm shrink-0", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>{msg.text}</div>}

      <div className="flex-1 min-h-0 p-4">
        <BlockCanvasBuilder<DocBlock>
          blocks={blocks} onChange={setBlocks}
          palette={PALETTE}
          makeBlock={(type, region) => makeDocBlock(type as BlockType, (region as BlockRegion) ?? "body")}
          preview={(b) => renderDocBlockPreview(b)}
          renderSettings={renderSettings}
          regions={REGIONS}
          pageWidth={720}
          pageStyle={{ padding: 40, minHeight: 400, fontFamily: "'Times New Roman', Georgia, serif" }}
        />
      </div>
    </div>
  )
}
