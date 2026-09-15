"use client"

import { useState } from "react"
import { Image as ImageIcon, Loader2, Check } from "lucide-react"
import { RichTextEditor } from "@/components/rich-text-editor"
import { MediaPicker } from "@/components/media-picker"

// The signature authoring control, shared by Settings → My Account (personal),
// Settings → Email (the organization default) and each shared mailbox.
//
// A logo goes through the media library on purpose: its /api/media/<id> URLs are
// public and unguessable, which is what an email image has to be — a recipient's
// mail client can't authenticate against us to load an <img>.

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
  const [picking, setPicking] = useState(false)

  const insertImage = (url: string) => {
    setPicking(false)
    onChange(`${value}<p><img src="${url}" alt="" style="max-width:320px;height:auto;border:0;" /></p>`)
  }

  return (
    <div className="space-y-3">
      <RichTextEditor value={value} onChange={onChange} minHeight={minHeight} placeholder="Your name, title, phone…" />

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
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm text-slate-400 italic mb-3">…your message ends here.</div>
            <div
              style={{
                marginTop: 18, paddingTop: 12, borderTop: "1px solid #e2e8f0",
                fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13, lineHeight: 1.5, color: "#334155",
              }}
              dangerouslySetInnerHTML={{ __html: value }}
            />
          </div>
        </div>
      )}

      <MediaPicker open={picking} onClose={() => setPicking(false)} onSelect={insertImage} />
    </div>
  )
}
