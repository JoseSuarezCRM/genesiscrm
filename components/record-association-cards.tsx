"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SlidersHorizontal, Plus, X, Check, Loader2, Search, GripVertical } from "lucide-react"
import {
  searchAssociableRecords, associateRecords, unassociateRecords, setNativeAssociation, setAssociationCardVisible, reorderAssociationCards,
} from "@/app/actions/associations"
import type { AssocCard } from "@/lib/record-associations"
import { useCardReorder } from "@/components/use-card-reorder"
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

  // Drag-and-drop reorder of the visible cards; hidden cards keep their slots.
  const dnd = useCardReorder(visible, (c) => c.type, (types) => {
    const hidden = cards.filter((c) => !c.visible).map((c) => c.type)
    startTransition(async () => { await reorderAssociationCards(recordType, [...types, ...hidden]); router.refresh() })
  })

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
                c.visible ? "bg-blue-600 border-blue-600" : "border-slate-300")}>
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

      {dnd.order.map((card) => (
        <AssociationCard key={card.type} recordType={recordType} recordId={recordId} card={card} canEdit={canEdit}
          dragging={dnd.dragging === card.type}
          handleProps={dnd.handleProps(card.type)} cardProps={dnd.cardProps(card.type)} />
      ))}
    </div>
  )
}

function AssociationCard({ recordType, recordId, card, canEdit, dragging, handleProps, cardProps }: {
  recordType: string; recordId: string; card: AssocCard; canEdit: boolean
  dragging?: boolean; handleProps?: any; cardProps?: any
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<{ id: string; name: string; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  // Native cards link via the FK/join mutation; Data-Model cards via objectAssociation.
  const searchType = card.native ? (card.addType ?? card.type) : card.type
  const canRemove = card.native ? !!card.removable : true

  function search(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setResults([]); return }
    startTransition(async () => {
      setResults(await searchAssociableRecords(searchType, value))
    })
  }

  function add(id: string) {
    setError(null)
    startTransition(async () => {
      const res = card.native
        ? await setNativeAssociation(recordType, recordId, card.type, id, "add")
        : await associateRecords(recordType, recordId, card.type, id)
      if ((res as any)?.error) { setError((res as any).error); return }
      setQ(""); setResults([]); setAdding(false); router.refresh()
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const res = card.native
        ? await setNativeAssociation(recordType, recordId, card.type, id, "remove")
        : await unassociateRecords(recordType, recordId, card.type, id)
      if ((res as any)?.error) { setError((res as any).error); return }
      router.refresh()
    })
  }

  return (
    <div {...cardProps} className={cn("bg-white border border-slate-200 rounded-xl transition-shadow", dragging && "opacity-50 ring-2 ring-zinc-300")}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0">
          {canEdit && (
            <span {...handleProps} title="Drag to reorder" className={cn("text-slate-300 hover:text-slate-500 shrink-0", handleProps?.className)}>
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {card.label} <span className="text-slate-400 font-normal">{card.records.length}</span>
          </h2>
        </div>
      </div>

      <div className="p-4 max-h-72 overflow-y-auto">
        {card.records.length === 0 ? (
          <p className="text-sm text-slate-400">No {card.label.toLowerCase()} linked.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {card.records.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={r.url} className="text-sm text-blue-600 hover:underline truncate">{r.name}</Link>
                {canEdit && canRemove && (
                  <button onClick={() => remove(r.id)} disabled={isPending} title="Remove association"
                    className="h-6 w-6 shrink-0 inline-flex items-center justify-center text-slate-300 hover:text-red-500 rounded">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          {adding ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={q} onChange={(e) => search(e.target.value)} placeholder={`Search ${card.label.toLowerCase()}…`} autoFocus
                  className="w-full h-8 pl-8 pr-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-zinc-400" />
              </div>
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              {results.map((r) => (
                <button key={r.id} onClick={() => add(r.id)}
                  className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-slate-50 text-slate-700 truncate">
                  {r.name}
                </button>
              ))}
              {q.trim().length >= 2 && !isPending && results.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-slate-400">No matches.</p>
              )}
              <button onClick={() => { setAdding(false); setQ(""); setResults([]); setError(null) }}
                className="text-xs text-slate-400 hover:text-slate-600 px-2">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add association
            </button>
          )}
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}
