"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ChevronDown, Search, Settings2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PipelineChip } from "@/components/pipeline-chip"

interface Pipeline { id: string; name: string; color: string }

// Searchable pipeline dropdown (replaces the horizontal tabs). Preserves the
// other list filters and just swaps the `pipeline` param.
export default function PipelineSelector({ pipelines, activePipelineId, managePath = "/settings/pipelines", colorStyle = "dot" }: {
  pipelines: Pipeline[]; activePipelineId: string | null; managePath?: string; colorStyle?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) { setQ(""); return }
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  function hrefFor(id: string | null) {
    const p = new URLSearchParams(params.toString())
    p.delete("page")
    if (id) p.set("pipeline", id); else p.delete("pipeline")
    const qs = p.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }
  function go(id: string | null) { setOpen(false); router.push(hrefFor(id)) }

  const active = pipelines.find((p) => p.id === activePipelineId)
  const label = active ? active.name : "All pipelines"
  const filtered = q ? pipelines.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : pipelines

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 hover:border-zinc-400">
        {active ? <PipelineChip name={active.name} color={active.color} style={colorStyle} /> : label}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 flex max-h-80 w-72 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="relative border-b border-zinc-100 p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pipelines…"
              className="w-full rounded-lg border border-zinc-200 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-zinc-400" />
          </div>
          <div className="overflow-y-auto py-1">
            {!q && (
              <button onClick={() => go(null)} className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50", !activePipelineId && "bg-zinc-50 font-medium")}>
                All pipelines {!activePipelineId && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            )}
            {filtered.map((p) => (
              <button key={p.id} onClick={() => go(p.id)} className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50", activePipelineId === p.id && "bg-zinc-50 font-medium")}>
                <PipelineChip name={p.name} color={p.color} style={colorStyle} />
                {activePipelineId === p.id && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">No pipelines found</p>}
          </div>
          <Link href={managePath} className="flex items-center gap-1.5 border-t border-zinc-100 px-3 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50">
            <Settings2 className="h-3.5 w-3.5" /> Manage pipelines
          </Link>
        </div>
      )}
    </div>
  )
}
