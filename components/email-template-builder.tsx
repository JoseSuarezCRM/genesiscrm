"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Save, ArrowLeft, Type, ImageIcon, Columns3, Minus, MoveVertical, MousePointerClick, Code2 } from "lucide-react"
import { RichTextEditor } from "@/components/rich-text-editor"
import { MESSAGE_TOKEN_GROUPS } from "@/lib/message-tokens"
import { updateMessageTemplate } from "@/app/actions/message-templates"
import { makeEmailBlock, type EmailBlock, type EmailBlockType, type Align, type ColumnChild } from "@/lib/email-blocks"
import { renderEmailBlock } from "@/lib/email-html"
import BlockCanvasBuilder, { type PaletteItem } from "@/components/block-canvas-builder"
import { cn } from "@/lib/utils"

const PALETTE: PaletteItem[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "columns", label: "Columns", icon: Columns3 },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: MoveVertical },
  { type: "html", label: "HTML", icon: Code2 },
]

interface Props { template: { id: string; name: string; subject: string | null; blocks: EmailBlock[] } }

export default function EmailTemplateBuilder({ template }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(template.name)
  const [subject, setSubject] = useState(template.subject ?? "")
  const [blocks, setBlocks] = useState<EmailBlock[]>(template.blocks)
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)

  // image upload
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

  function save(afterMode?: "richtext") {
    setMsg(null); setSaving(true)
    ;(async () => {
      const r = await updateMessageTemplate(template.id, { name, subject, body: "", blocks: afterMode === "richtext" ? null : blocks })
      setSaving(false)
      if (r.error) return setMsg({ text: r.error })
      if (afterMode === "richtext") { router.push("/communications/email"); return }
      setMsg({ text: "Saved.", ok: true }); router.refresh()
    })()
  }

  const alignSel = (v: Align | undefined, on: (a: Align) => void) => (
    <select value={v ?? "left"} onChange={(e) => on(e.target.value as Align)} className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white w-full">
      <option value="left">Align left</option><option value="center">Align center</option><option value="right">Align right</option>
    </select>
  )
  const field = "w-full h-8 px-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-zinc-400"
  const lbl = "block text-[11px] text-slate-500"

  // Settings for a leaf block/child (everything except columns).
  function LeafSettings(b: ColumnChild, patch: (p: Partial<ColumnChild>) => void) {
    if (b.type === "text") return (
      <div className="space-y-2">
        <RichTextEditor value={b.html} onChange={(html) => patch({ html })} tokenGroups={MESSAGE_TOKEN_GROUPS} minHeight={120} placeholder="Write text… use Fields for tokens" />
        {alignSel(b.align, (a) => patch({ align: a }))}
      </div>
    )
    if (b.type === "button") return (
      <div className="space-y-2">
        <label className={lbl}>Label<input value={b.label} onChange={(e) => patch({ label: e.target.value })} className={field} /></label>
        <label className={lbl}>Link URL<input value={b.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://…" className={field} /></label>
        <div className="flex gap-2">
          <label className={lbl + " flex-1"}>Background<input type="color" value={b.bg || "#2563eb"} onChange={(e) => patch({ bg: e.target.value })} className="block h-8 w-full border border-slate-200 rounded-md" /></label>
          <label className={lbl + " flex-1"}>Text<input type="color" value={b.color || "#ffffff"} onChange={(e) => patch({ color: e.target.value })} className="block h-8 w-full border border-slate-200 rounded-md" /></label>
        </div>
        {alignSel(b.align, (a) => patch({ align: a }))}
      </div>
    )
    if (b.type === "image") return (
      <div className="space-y-2">
        {b.url && <img src={b.url} alt="" className="max-h-24 max-w-full object-contain border border-slate-100 rounded" />}
        <button onClick={() => pickImage((url) => patch({ url }))} className="h-8 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 w-full">{b.url ? "Replace image" : "Upload image"}</button>
        <label className={lbl}>Width (px)<input type="number" value={b.width ?? 560} onChange={(e) => patch({ width: Number(e.target.value) || 560 })} className={field} /></label>
        <label className={lbl}>Link URL (optional)<input value={b.href ?? ""} onChange={(e) => patch({ href: e.target.value })} placeholder="https://…" className={field} /></label>
        {alignSel(b.align, (a) => patch({ align: a }))}
      </div>
    )
    if (b.type === "divider") return <label className={lbl}>Thickness (px)<input type="number" value={b.thickness ?? 1} onChange={(e) => patch({ thickness: Number(e.target.value) || 1 })} className={field} /></label>
    if (b.type === "spacer") return <label className={lbl}>Height (px)<input type="number" value={b.height ?? 20} onChange={(e) => patch({ height: Number(e.target.value) || 20 })} className={field} /></label>
    if (b.type === "html") return <textarea value={b.html} onChange={(e) => patch({ html: e.target.value })} placeholder="<table>…</table>" className="w-full h-40 p-2 text-xs font-mono border border-slate-200 rounded-md" />
    return null
  }

  // Full settings (leaf or columns) shown in the right panel.
  function renderSettings(b: EmailBlock, patch: (p: Partial<EmailBlock>) => void) {
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
              {(["text", "image", "button"] as EmailBlockType[]).map((t) => (
                <button key={t} onClick={() => setCol((cols) => cols.map((c, i) => (i === ci ? [...c, makeEmailBlock(t) as ColumnChild] : c)))} className="text-[11px] text-blue-600 hover:underline">+ {t}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (!f) return; const url = await uploadAsset(f); if (url) uploadTarget.current(url)
      }} />

      <div className="flex flex-wrap items-end gap-2">
        <button onClick={() => router.push("/communications/email")} className="inline-flex items-center gap-1 h-9 px-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</button>
        <label className="text-xs text-slate-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className="block w-52 mt-1 h-9 px-3 text-sm border border-slate-200 rounded-lg" /></label>
        <label className="text-xs text-slate-500">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} className="block w-72 mt-1 h-9 px-3 text-sm border border-slate-200 rounded-lg" placeholder="Subject line (tokens ok)" /></label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => save("richtext")} disabled={saving} className="h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Switch to rich text</button>
          <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        </div>
      </div>
      {msg && <div className={cn("rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>{msg.text}</div>}

      <BlockCanvasBuilder<EmailBlock>
        blocks={blocks} onChange={setBlocks}
        palette={PALETTE}
        makeBlock={(type) => makeEmailBlock(type as EmailBlockType)}
        preview={(b) => renderEmailBlock(b)}
        renderSettings={renderSettings}
        pageWidth={640}
        pageStyle={{ padding: 24 }}
      />
    </div>
  )
}
