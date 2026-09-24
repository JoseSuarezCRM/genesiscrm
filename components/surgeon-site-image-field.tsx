"use client"

import { useState } from "react"
import Image from "next/image"
import { ImageIcon, X } from "lucide-react"
import { MediaPicker } from "@/components/media-picker"

/**
 * One of a surgeon's photographs, chosen from the media library.
 *
 * The library is used rather than a URL box because the site app runs on
 * separate infrastructure with no access to this one: it needs an address it can
 * fetch without a session, and /api/media/[id] is public by design for exactly
 * that. A pasted URL would work until whatever hosts it changes.
 *
 * Blank is a valid answer. The site renders nothing rather than falling back to
 * another surgeon's likeness, so a missing photograph is a gap on one page — not
 * a false statement about who the surgeon is.
 */
export function SurgeonImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (url: string) => void
}) {
  const [picking, setPicking] = useState(false)

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-700">{label}</label>
      <p className="text-[11px] leading-snug text-zinc-500">{hint}</p>

      <div className="mt-1.5 flex items-start gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- the media
            // route serves arbitrary uploads; next/image would need each host
            // whitelisted and buys nothing for a 80px thumbnail.
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-300">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {value ? "Replace" : "Choose image"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-600"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>

      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={(url) => { onChange(url); setPicking(false) }}
      />
    </div>
  )
}
