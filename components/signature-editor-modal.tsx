"use client"

import { useEffect, useState } from "react"
import { X, Loader2, Check } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import SignatureEditor from "@/components/signature-editor"

// A signature gets its own window.
//
// Email signatures are wide — this one is a 600px table with a four-logo row —
// and editing one inside a settings accordion means working in a column narrower
// than the thing being edited, which makes the editor's rendering misleading on
// top of being cramped. The modal gives it the width it actually needs.
//
// The draft lives here and is only handed back on save, so closing without
// saving discards cleanly and the row behind keeps showing what's stored.

export default function SignatureEditorModal({
  open,
  onClose,
  title,
  subtitle,
  initialHtml,
  onSave,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  initialHtml: string
  /** Resolve false to keep the modal open (a failed save). */
  onSave: (html: string) => Promise<boolean>
}) {
  const [html, setHtml] = useState(initialHtml)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Re-seed each time it opens, so a discarded edit doesn't persist into the
  // next open and a save elsewhere is picked up.
  useEffect(() => {
    if (open) { setHtml(initialHtml); setSaved(false) }
  }, [open, initialHtml])

  const dirty = html !== initialHtml

  const save = async () => {
    setSaving(true)
    try {
      const ok = await onSave(html)
      if (ok) { setSaved(true); onClose() }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        className="max-w-[min(1100px,calc(100vw-3rem))] w-full h-[min(860px,calc(100vh-3rem))] p-0 gap-0 grid-rows-[auto_1fr_auto] overflow-hidden"
        // The editor owns the scroll; letting the dialog grab focus first would
        // put the caret in the contenteditable before it has content.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <SignatureEditor
            value={html}
            onChange={(v) => { setHtml(v); setSaved(false) }}
            onSave={save}
            saving={saving}
            saved={saved}
            minHeight={220}
            hideSaveButton
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
          <span className="text-xs text-slate-400">
            {dirty ? "Unsaved changes" : "No changes"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
              {saving ? "Saving…" : "Save signature"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
