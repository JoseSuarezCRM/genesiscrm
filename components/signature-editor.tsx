"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Image as ImageIcon, Loader2, Check, Code2, Type, AlertTriangle, Upload, Download } from "lucide-react"
import { RichTextEditor } from "@/components/rich-text-editor"
import { MediaPicker } from "@/components/media-picker"
import { sanitizeSignatureHtml } from "@/lib/sanitize-signature"
import { importSignatureImages } from "@/app/actions/signature-images"
import { cn } from "@/lib/utils"

// The signature authoring control, shared by Settings → My Account (personal),
// Settings → Email (the organization default) and each shared mailbox.
//
// Two modes, because a signature is usually *pasted* rather than written: Design
// for small edits, HTML for dropping in the real markup from Outlook.
//
// Images are the hard part. Outlook keeps a signature as Name.htm plus a
// Name_files folder and attaches the bytes to each message it sends, so pasted
// markup only ever carries *references* — to a path on the sender's PC, or to an
// OWA URL needing their login. Neither we nor the recipient can load those, so
// any image that isn't in our media library has to be re-uploaded here. Anything
// left unresolved reaches recipients broken, which is why the warning is loud.

/** An <img> in the signature whose src we can't serve to a recipient. */
interface BrokenImage {
  src: string
  label: string
}

const MEDIA_SRC = /\/api\/media\/[A-Za-z0-9_-]+/

function findImages(html: string): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = []
  const re = /<img\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const tag = m[0]
    const src = /src="([^"]*)"/i.exec(tag)?.[1] ?? /src='([^']*)'/i.exec(tag)?.[1] ?? ""
    const alt = /alt="([^"]*)"/i.exec(tag)?.[1] ?? ""
    if (src) out.push({ src, alt })
  }
  return out
}

/** A readable name for an image we can't load — its alt, or the tail of its src. */
function labelFor(src: string, alt: string): string {
  if (alt.trim()) return alt.trim()
  if (src.startsWith("data:")) return "pasted image"
  if (src.startsWith("cid:")) return src.slice(4)
  const tail = src.split(/[/\\]/).pop() ?? src
  return (tail.split("?")[0] || src).slice(0, 60)
}

export default function SignatureEditor({
  value,
  onChange,
  onSave,
  saving,
  saved,
  minHeight = 160,
}: {
  value: string
  onChange: (html: string) => void
  onSave: () => void
  saving?: boolean
  saved?: boolean
  minHeight?: number
}) {
  const [mode, setMode] = useState<"design" | "html">("design")
  const [picking, setPicking] = useState(false)
  const [fixing, setFixing] = useState<string | null>(null)
  const [autoFixing, setAutoFixing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const images = useMemo(() => findImages(value), [value])
  const dedupe = (list: BrokenImage[]) =>
    // One row per distinct src — the same logo twice is one fix.
    list.filter((b, idx, arr) => arr.findIndex((x) => x.src === b.src) === idx)

  // Hosted elsewhere but publicly reachable: the server can fetch these, so they
  // only need importing, not re-uploading.
  const remote: BrokenImage[] = useMemo(
    () => dedupe(images
      .filter((i) => /^https?:\/\//i.test(i.src) && !MEDIA_SRC.test(i.src))
      .map((i) => ({ src: i.src, label: labelFor(i.src, i.alt) }))),
    [images],
  )
  // cid:, file: or a bare path — nothing can fetch these, so the file is the
  // only way in.
  const unfetchable: BrokenImage[] = useMemo(
    () => dedupe(images
      .filter((i) => !MEDIA_SRC.test(i.src) && !i.src.startsWith("data:") && !/^https?:\/\//i.test(i.src))
      .map((i) => ({ src: i.src, label: labelFor(i.src, i.alt) }))),
    [images],
  )

  // The same sanitiser the server applies on save, so the preview shows exactly
  // what gets stored. It's deliberately NOT isomorphic-dompurify: Next renders
  // client components on the server using that package's node build, which
  // require()s jsdom at module scope — and jsdom's dependencies are ESM-only, so
  // on a Node that can't require() an ES module the whole route 500s.
  const previewHtml = useMemo(() => sanitizeSignatureHtml(value), [value])

  const replaceSrc = (from: string, to: string) => {
    // Escape the old src: it may contain regex metacharacters.
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    onChange(value.replace(new RegExp(esc, "g"), to))
  }

  const upload = async (file: File): Promise<string | null> => {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/media/upload", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    return res.ok ? (data.url as string) : null
  }

  // A pasted image sometimes arrives as a data: URI — we have the bytes, so those
  // can be re-hosted without asking. Runs once per value change; anything that
  // isn't a data: URI can't be fetched and lands in the fixer panel instead.
  useEffect(() => {
    const dataImgs = images.filter((i) => i.src.startsWith("data:image/"))
    if (!dataImgs.length || autoFixing) return
    let cancelled = false
    setAutoFixing(true)
    ;(async () => {
      let next = value
      for (const img of dataImgs) {
        try {
          const blob = await (await fetch(img.src)).blob()
          const ext = (blob.type.split("/")[1] || "png").replace("+xml", "")
          const url = await upload(new File([blob], `signature-image.${ext}`, { type: blob.type }))
          if (url) {
            const esc = img.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            next = next.replace(new RegExp(esc, "g"), url)
          }
        } catch { /* leave it; the fixer will list it */ }
      }
      if (!cancelled && next !== value) onChange(next)
      if (!cancelled) setAutoFixing(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const insertImage = (url: string) => {
    setPicking(false)
    onChange(`${value}<p><img src="${url}" alt="" style="max-width:320px;height:auto;border:0;" /></p>`)
  }

  const runImport = async () => {
    setImporting(true); setImportMsg(null)
    try {
      const res = await importSignatureImages(value)
      if (res.html !== value) onChange(res.html)
      setImportMsg(
        res.failed.length
          ? `Imported ${res.imported}. Couldn't fetch ${res.failed.length}: ${res.failed.map((f) => f.reason).join(", ")}`
          : `Imported ${res.imported} image${res.imported === 1 ? "" : "s"}.`,
      )
    } catch {
      setImportMsg("Import failed.")
    } finally {
      setImporting(false)
    }
  }

  const onPickFile = async (src: string, file: File | undefined) => {
    if (!file) return
    setFixing(src)
    try {
      const url = await upload(file)
      if (url) replaceSrc(src, url)
    } finally {
      setFixing(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {(["design", "html"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
              mode === m ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100",
            )}
          >
            {m === "design" ? <Type className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
            {m === "design" ? "Design" : "HTML"}
          </button>
        ))}
        {autoFixing && (
          <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving pasted images…
          </span>
        )}
      </div>

      {/* Conditional render, not a hidden class: RichTextEditor only copies `value`
          into the DOM on mount, so the remount is what re-seeds it after an edit
          made in HTML mode. */}
      {mode === "design" ? (
        <RichTextEditor value={value} onChange={onChange} minHeight={minHeight} placeholder="Your name, title, phone…" />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ minHeight }}
          placeholder="Paste your signature HTML here…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/10 focus:border-zinc-400"
        />
      )}

      {remote.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Download className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-900">
              <p className="font-semibold">
                {remote.length} image{remote.length === 1 ? "" : "s"} hosted elsewhere
              </p>
              <p className="mt-0.5 text-blue-800">
                These load today, but only for recipients who allow remote images — and Outlook blocks
                them by default. Import them and they travel inside the message instead, so they always
                show.
              </p>
              <p className="mt-1 truncate text-blue-700" title={remote.map((r) => r.src).join(", ")}>
                {remote.map((r) => r.label).join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-6">
            <button
              type="button"
              onClick={() => void runImport()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-blue-300 bg-white text-xs font-medium text-blue-900 hover:border-blue-400 disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              {importing ? "Importing…" : "Import images"}
            </button>
            {importMsg && <span className="text-xs text-blue-700">{importMsg}</span>}
          </div>
        </div>
      )}

      {unfetchable.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold">
                {unfetchable.length} image{unfetchable.length === 1 ? "" : "s"} can&apos;t be loaded
              </p>
              <p className="mt-0.5 text-amber-800">
                Outlook keeps signature images in a separate folder and attaches them to each message, so
                pasted HTML only points at them. Upload each one here — until you do,{" "}
                <strong>recipients will see broken images too</strong>.
              </p>
            </div>
          </div>
          {unfetchable.map((b) => (
            <div key={b.src} className="flex items-center gap-2 pl-6">
              <span className="flex-1 truncate text-xs text-amber-900" title={b.src}>{b.label}</span>
              <input
                ref={(el) => { fileRefs.current[b.src] = el }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPickFile(b.src, e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRefs.current[b.src]?.click()}
                disabled={fixing === b.src}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-amber-300 bg-white text-xs font-medium text-amber-900 hover:border-amber-400 disabled:opacity-50"
              >
                {fixing === b.src ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Upload
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-slate-300"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Add image
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
          {saving ? "Saving…" : saved ? "Saved" : "Save signature"}
        </button>
      </div>

      {value.trim() && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1.5">Preview</div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto">
            <div className="text-sm text-slate-400 italic mb-3">…your message ends here.</div>
            <div
              style={{
                marginTop: 18, paddingTop: 12, borderTop: "1px solid #e2e8f0",
                fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13, lineHeight: 1.5, color: "#334155",
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      )}

      <MediaPicker open={picking} onClose={() => setPicking(false)} onSelect={insertImage} />
    </div>
  )
}
