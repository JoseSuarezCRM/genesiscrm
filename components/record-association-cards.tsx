"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SlidersHorizontal, Plus, X, Check, Loader2, Search } from "lucide-react"
import {
  searchAssociableRecords, associateRecords, unassociateRecords, setAssociationCardVisible,
} from "@/app/actions/associations"
import type { AssocCard } from "@/lib/record-associations"
import { cn } from "@/lib/utils"

/**
 * The right column of a record page: one card per associated object type, exactly
 * like Referrals. Every type associated with this object in the Data Model shows
 * up in "Customize cards", so a new association is immediately displayable.
 */
export default function RecordAssociationCards({ recordType, recordId, cards, canEdit }: {
  recordType: string
  recordId: string
  cards: AssocCard[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [customizing, setCustomizing] = useState(false)

  function toggleCard(cardType: string, visible: boolean) {
    startTransition(async () => {
      await setAssociationCardVisible(recordType, cardType, visible)
      router.refresh()
    })
  }

  const visible = cards.filter((c) => c.visible)

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <button onClick={() => setCustomizing((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Customize cards
          </button>
        </div>
      )}

      {customizing && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500 mb-2">Show cards for the objects associated with this one.</p>
          {cards.map((c) => (
            <button key={c.type} onClick={() => toggleCard(c.type, !c.visible)} disabled={isPending}
              className="w-full flex items-center gap-2 px-1 py-1.5 text-sm text-left rounded-md hover:bg-slate-50">
              <span className={cn("shrink-0 w-[14px] h-[14px] rounded border flex items-center justify-center",
                c.visible ? "bg-zinc-900 border-zinc-900" : "border-slate-300")}>
                {c.visible && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </span>
              <span className="text-slate-700">{c.label}</span>
              <span className="ml-auto text-xs text-slate-400">{c.records.length}</span>
            </button>
          ))}
          {cards.length === 0 && (
            <p className="text-sm text-slate-400">
              No associations defined yet. Add one in Settings → Data Model.
            </p>
          )}
        </div>
      )}

      {visible.map((card) => (
        <AssociationCard key={card.type} recordType={recordType} recordId={recordId} card={card} canEdit={canEdit} />
      ))}
    </div>
  )
}

function AssociationCard({ recordType, recordId, card, canEdit }: {
  recordType: string; recordId: string; card: AssocCard; canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string; url: string }[]>([])

  function search(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setResults([]); return }
    startTransition(async () => {
      setResults(await searchAssociableRecords(card.type, value))
    })
  }

  function add(id: string) {
    startTransition(async () => {
      await associateRecords(recordType, recordId, card.type, id)
      setQ(""); setResults([]); setAdding(false); router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      await unassociateRecords(recordType, recordId, card.type, id)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">
          {card.label} <span className="text-slate-400 font-normal">{card.records.length}</span>
        </h2>
        {canEdit && !card.native && (
          <button onClick={() => setAdding((v) => !v)} title={`Associate a ${card.label}`}
            className="text-slate-400 hover:text-slate-800">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-slate-100 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search…" autoFocus
              className="w-full h-8 pl-8 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
          </div>
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          {results.map((r) => (
            <button key={r.id} onClick={() => add(r.id)}
              className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-slate-50 text-slate-700">
              {r.name}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 max-h-72 overflow-y-auto">
        {card.records.length === 0 ? (
          <p className="text-sm text-slate-400">No {card.label.toLowerCase()} linked.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {card.records.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={r.url} className="text-sm text-blue-600 hover:underline truncate">{r.name}</Link>
                {canEdit && !card.native && (
                  <button onClick={() => remove(r.id)} disabled={isPending}
                    className="h-6 w-6 shrink-0 inline-flex items-center justify-center text-slate-300 hover:text-red-500 rounded">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
