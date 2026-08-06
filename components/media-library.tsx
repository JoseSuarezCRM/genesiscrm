"use client"

import { useRef, useState } from "react"
import { Loader2, Upload, Trash2, ImageIcon, Link2, Check } from "lucide-react"
import { deleteMediaAsset, type MediaAssetDTO } from "@/app/actions/media"

function fmtSize(n: number): string {
  if (!n) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// Full-page media library: upload, browse, copy public link, delete. Same
// storage/serving as the in-builder MediaPicker (private blob + /api/media/[id]).
export default function MediaLibrary({ initial }: { initial: MediaAssetDTO[] }) {
  const [assets, setAssets] = useState<MediaAssetDTO[]>(initial)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList) => {
    setUploading(true)
    setError(null)
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/media/upload", { method: "POST", body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Upload failed.")
        setAssets((a) => [{ id: data.id, name: data.name, url: data.url, contentType: file.type, size: file.size, createdAt: new Date().toISOString() }, ...a])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.")
      }
    }
    setUploading(false)
  }

  const remove = async (id: string) => {
    setAssets((a) => a.filter((x) => x.id !== id))
    await deleteMediaAsset(id)
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500)
    } catch {}
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{assets.length} image{assets.length === 1 ? "" : "s"}</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload images
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      {assets.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 py-16 text-slate-400 hover:border-zinc-300 hover:text-slate-500"
        >
          <ImageIcon className="h-10 w-10" />
          <span className="text-sm font-medium">Upload your first image</span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((a) => (
            <div key={a.id} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="flex aspect-square items-center justify-center bg-zinc-50">
                <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="border-t border-zinc-100 p-2.5">
                <p className="truncate text-xs font-medium text-slate-700" title={a.name}>{a.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{fmtSize(a.size)}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    onClick={() => copy(a.url)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                  >
                    {copied === a.url ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Link2 className="h-3 w-3" /> Copy link</>}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-md border border-zinc-200 p-1.5 text-slate-400 hover:border-red-200 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
