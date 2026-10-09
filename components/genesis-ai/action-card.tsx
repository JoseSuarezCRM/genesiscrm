"use client"

import Link from "next/link"
import { useState } from "react"
import { Check, X, Loader2, AlertTriangle, Clock, ArrowUpRight } from "lucide-react"
import { confirmGenesisAction, cancelGenesisAction } from "@/app/actions/genesis-ai"
import type { ActionView } from "@/lib/genesis-ai/actions/types"
import { cn } from "@/lib/utils"

/**
 * A change Genesis AI proposed. Nothing happens until Confirm — which re-checks
 * the person's access and runs the CRM's own action as them.
 * Confirm waits until the answer has finished streaming, so the chat's history
 * stays in order.
 */
export default function ActionCard({ action, disabled, onChange }: { action: ActionView; disabled?: boolean; onChange: (v: ActionView) => void }) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { card, status, result } = action
  const pending = status === "PENDING"

  async function run(which: "confirm" | "cancel") {
    setBusy(which); setError(null)
    try {
      onChange(await (which === "confirm" ? confirmGenesisAction(action.id) : cancelGenesisAction(action.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn("rounded-xl border bg-white p-3", card.danger ? "border-red-200" : "border-zinc-200")}>
      <p className={cn("text-sm font-semibold", card.danger ? "text-red-700" : "text-zinc-900")}>{card.title}</p>
      {card.lines.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {card.lines.map((l, i) => <li key={i} className="whitespace-pre-wrap break-words text-xs text-zinc-600">{l}</li>)}
        </ul>
      )}
      {card.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {card.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</p>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {pending ? (
          <>
            <button onClick={() => run("confirm")} disabled={!!busy || disabled}
              title={disabled ? "Wait for the answer to finish" : undefined}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white disabled:opacity-40",
                card.danger ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800")}>
              {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {card.danger ? "Confirm delete" : "Confirm"}
            </button>
            <button onClick={() => run("cancel")} disabled={!!busy || disabled}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40">
              {busy === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Cancel
            </button>
          </>
        ) : status === "RUNNING" ? (
          <p className="flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…</p>
        ) : status === "DONE" ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" /> {result?.message ?? "Done."}
            {result?.link && (
              <Link href={result.link} className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:underline">
                Open <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </p>
        ) : status === "FAILED" ? (
          <p className="flex items-start gap-1.5 text-xs text-red-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {result?.message ?? "It didn't work."}</p>
        ) : status === "CANCELLED" ? (
          <p className="text-xs text-zinc-500">Cancelled — nothing was changed.</p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-zinc-500"><Clock className="h-3.5 w-3.5" /> Expired — ask again to redo it.</p>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
