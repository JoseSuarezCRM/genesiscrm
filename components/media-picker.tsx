"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Upload, Trash2, ImageIcon, X } from "lucide-react"
import { listMediaAssets, deleteMediaAsset, type MediaAssetDTO } from "@/app/actions/media"

// Reusable image/media library. Opens as a modal: browse previously uploaded
// assets or upload a new one, then pick it. Selecting returns the asset's stable
// PUBLIC url (/api/media/<id>) — usable in the builder, emails and PDFs alike.
export function MediaPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}) {
  const [assets, setAssets] = useState<MediaAssetDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listMediaAssets()
      .then(setAssets)
      .catch(() => setError("Couldn't load the media library."))
      .finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/media/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed.")
      setAssets((a) => [{ id: data.id, name: data.name, url: data.url, contentType: file.type, size: file.size, createdAt: new Date().toISOString() }, ...a])
      onSelect(data.url)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id: string) => {
    setAssets((a) => a.filter((x) => x.id !== id))
    await deleteMediaAsset(id)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/40 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <ImageIcon className="h-4 w-4" /> Media library
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">{error}</div>}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-zinc-400">
              <ImageIcon className="h-8 w-8" />
              <p>No images yet. Upload one to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {assets.map((a) => (
                <div key={a.id} className="group relative overflow-hidden rounded-lg border border-zinc-200">
                  <button
                    onClick={() => {
                      onSelect(a.url)
                      onClose()
                    }}
                    className="flex aspect-square w-full items-center justify-center bg-zinc-50"
                    title={a.name}
                  >
                    <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" />
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-zinc-500 opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="truncate border-t border-zinc-100 px-1.5 py-1 text-[10px] text-zinc-500">{a.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
