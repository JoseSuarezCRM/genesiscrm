"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2, ChevronUp, ChevronDown, Type, ImageIcon, Columns3, Minus, MoveVertical, MousePointerClick, Code2, Save, ArrowLeft } from "lucide-react"
import { RichTextEditor } from "@/components/rich-text-editor"
import { MESSAGE_TOKEN_GROUPS } from "@/lib/message-tokens"
import { updateMessageTemplate } from "@/app/actions/message-templates"
import { makeEmailBlock, type EmailBlock, type EmailBlockType, type Align, type ColumnChild } from "@/lib/email-blocks"
import { renderEmailHtml, emailShell } from "@/lib/email-html"
import { cn } from "@/lib/utils"

const PALETTE: { type: EmailBlockType; label: string; icon: any }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "image", label: "Image", icon: ImageIcon },
  { type: "button", label: "Button", icon: MousePointerClick },
  { type: "columns", label: "Columns", icon: Columns3 },
  { type: "divider", label: "Divider", icon: Minus },
  { type: "spacer", label: "Spacer", icon: MoveVertical },
  { type: "html", label: "HTML", icon: Code2 },
]

interface Props {
  template: { id: string; name: string; subject: string | null; blocks: EmailBlock[] }
}

export default function EmailTemplateBuilder({ template }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(template.name)
  const [subject, setSubject] = useState(template.subject ?? "")
  const [blocks, setBlocks] = useState<EmailBlock[]>(template.blocks)
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)

  const flash = (text: string, ok = false) => setMsg({ text, ok })

  // ── mutations ──
  const updateTop = (id: string, patch: Partial<EmailBlock>) => setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)))
  const removeTop = (id: string) => setBlocks((bs) => bs.filter((b) => b.id !== id))
  const addTop = (type: EmailBlockType) => setBlocks((bs) => [...bs, makeEmailBlock(type)])
  const move = (id: string, dir: -1 | 1) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= bs.length) return bs
    const next = [...bs];[next[i], next[j]] = [next[j], next[i]]; return next
  })
  const mutateCols = (colId: string, fn: (cols: ColumnChild[][]) => ColumnChild[][]) =>
    setBlocks((bs) => bs.map((b) => (b.id === colId && b.type === "columns" ? { ...b, columns: fn(b.columns) } : b)))
  const addColChild = (colId: string, ci: number, type: EmailBlockType) =>
    mutateCols(colId, (cols) => cols.map((c, i) => (i === ci ? [...c, makeEmailBlock(type === "columns" ? "text" : type) as ColumnChild] : c)))
  const updateColChild = (colId: string, ci: number, childId: string, patch: Partial<ColumnChild>) =>
    mutateCols(colId, (cols) => cols.map((c, i) => (i === ci ? c.map((ch) => (ch.id === childId ? ({ ...ch, ...patch } as ColumnChild) : ch)) : c)))
  const removeColChild = (colId: string, ci: number, childId: string) =>
    mutateCols(colId, (cols) => cols.map((c, i) => (i === ci ? c.filter((ch) => ch.id !== childId) : c)))
  const setColCount = (colId: string, count: number) =>
    mutateCols(colId, (cols) => { const next = [...cols]; while (next.length < count) next.push([]); return next.slice(0, count) })

  // ── uploads ──
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<(url: string) => void>(() => {})
  const pickImage = (onUrl: (url: string) => void) => { uploadTarget.current = onUrl; fileRef.current?.click() }
  async function uploadAsset(file: File): Promise<string | null> {
    const fd = new FormData(); fd.append("file", file)
    const res = await fetch("/api/documents/asset-upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { flash(data.error ?? "Upload failed."); return null }
    return data.url as string
  }

  function save(afterMode?: "richtext") {
    setMsg(null); setSaving(true)
    ;(async () => {
      const r = await updateMessageTemplate(template.id, { name, subject, body: "", blocks: afterMode === "richtext" ? null : blocks })
      setSaving(false)
      if (r.error) return flash(r.error)
      if (afterMode === "richtext") { router.push("/communications/email"); return }
      flash("Saved.", true); router.refresh()
    })()
  }

  const input = "h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400"
  const alignSel = (v: Align | undefined, on: (a: Align) => void) => (
    <select value={v ?? "left"} onChange={(e) => on(e.target.value as Align)} className="h-7 px-1 text-xs border border-slate-200 rounded-md bg-white">
      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
    </select>
  )

  function LeafEditor({ b, onPatch, onUpload }: { b: ColumnChild; onPatch: (p: Partial<ColumnChild>) => void; onUpload: () => void }) {
    if (b.type === "text") return (
      <div className="space-y-1">
        <div className="flex items-center gap-2"><span className="text-[11px] text-slate-400">Text</span>{alignSel(b.align, (a) => onPatch({ align: a }))}</div>
        <RichTextEditor value={b.html} onChange={(html) => onPatch({ html })} tokenGroups={MESSAGE_TOKEN_GROUPS} minHeight={90} placeholder="Write text… use Fields for tokens" />
      </div>
    )
    if (b.type === "button") return (
      <div className="flex flex-wrap items-center gap-2">
        <input value={b.label} onChange={(e) => onPatch({ label: e.target.value })} placeholder="Label" className="h-7 px-2 text-xs border border-slate-200 rounded-md w-32" />
        <input value={b.url} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://…" className="h-7 px-2 text-xs border border-slate-200 rounded-md w-48" />
        <label className="text-[11px] text-slate-500 flex items-center gap-1">BG<input type="color" value={b.bg || "#2563eb"} onChange={(e) => onPatch({ bg: e.target.value })} className="h-6 w-8 border border-slate-200 rounded" /></label>
        <label className="text-[11px] text-slate-500 flex items-center gap-1">Text<input type="color" value={b.color || "#ffffff"} onChange={(e) => onPatch({ color: e.target.value })} className="h-6 w-8 border border-slate-200 rounded" /></label>
        {alignSel(b.align, (a) => onPatch({ align: a }))}
      </div>
    )
    if (b.type === "image") return (
      <div className="flex flex-wrap items-center gap-2">
        {b.url ? <img src={b.url} alt="" className="h-12 max-w-[140px] object-contain border border-slate-100 rounded" /> : <span className="text-xs text-slate-400">No image</span>}
        <button onClick={onUpload} className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50">{b.url ? "Replace" : "Upload"}</button>
        <label className="text-[11px] text-slate-500">W<input type="number" value={b.width ?? 560} onChange={(e) => onPatch({ width: Number(e.target.value) || 560 })} className="ml-1 h-7 w-20 px-2 text-xs border border-slate-200 rounded-md" /></label>
        <input value={b.href ?? ""} onChange={(e) => onPatch({ href: e.target.value })} placeholder="Link URL (optional)" className="h-7 px-2 text-xs border border-slate-200 rounded-md w-44" />
        {alignSel(b.align, (a) => onPatch({ align: a }))}
      </div>
    )
    if (b.type === "divider") return <label className="text-[11px] text-slate-500 flex items-center gap-2">Divider · thickness<input type="number" value={b.thickness ?? 1} onChange={(e) => onPatch({ thickness: Number(e.target.value) || 1 })} className="h-7 w-16 px-2 text-xs border border-slate-200 rounded-md" /></label>
    if (b.type === "spacer") return <label className="text-[11px] text-slate-500 flex items-center gap-2">Spacer · height<input type="number" value={b.height ?? 20} onChange={(e) => onPatch({ height: Number(e.target.value) || 20 })} className="h-7 w-16 px-2 text-xs border border-slate-200 rounded-md" /></label>
    if (b.type === "html") return <textarea value={b.html} onChange={(e) => onPatch({ html: e.target.value })} placeholder="<table>…</table>" className="w-full h-24 p-2 text-xs font-mono border border-slate-200 rounded-md" />
    return null
  }

  function BlockCard({ b }: { b: EmailBlock }) {
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
                  <div className="flex flex-wrap gap-1">
                    {(["text", "image", "button"] as EmailBlockType[]).map((t) => (
                      <button key={t} onClick={() => addColChild(b.id, ci, t)} className="text-[11px] text-blue-600 hover:underline">+ {t}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <LeafEditor b={b as ColumnChild} onPatch={(p) => updateTop(b.id, p as Partial<EmailBlock>)} onUpload={() => pickImage((url) => updateTop(b.id, { url } as Partial<EmailBlock>))} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""
        if (!f) return; const url = await uploadAsset(f); if (url) uploadTarget.current(url)
      }} />

      <div className="flex flex-wrap items-end gap-2">
        <button onClick={() => router.push("/communications/email")} className="inline-flex items-center gap-1 h-9 px-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</button>
        <label className="text-xs text-slate-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className={cn(input, "block w-56 mt-1")} /></label>
        <label className="text-xs text-slate-500">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} className={cn(input, "block w-72 mt-1")} placeholder="Subject line (tokens ok)" /></label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => save("richtext")} disabled={saving} className="h-9 px-3 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50" title="Switch this template to the simple rich-text editor">Switch to rich text</button>
          <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
        </div>
      </div>
      {msg && <div className={cn("rounded-lg border px-3 py-2 text-sm", msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>{msg.text}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PALETTE.map((p) => (
              <button key={p.type} onClick={() => addTop(p.type)} className="inline-flex items-center gap-1 h-7 px-2 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                <p.icon className="h-3 w-3" /> {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {blocks.length === 0 && <p className="text-xs text-slate-400 italic">Add blocks from the palette above.</p>}
            {blocks.map((b) => <BlockCard key={b.id} b={b} />)}
          </div>
        </div>
        {/* Live preview */}
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Preview <span className="normal-case">(tokens shown literally)</span></p>
          <iframe title="preview" className="w-full h-[70vh] border border-slate-200 rounded-lg bg-white" srcDoc={emailShell(renderEmailHtml(blocks))} />
        </div>
      </div>
    </div>
  )
}
