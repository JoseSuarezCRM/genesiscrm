"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { SlidersHorizontal, Plus, X, Check, Loader2, Search, GripVertical, AlertTriangle, Settings2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  searchAssociableRecords, associateRecords, unassociateRecords, setNativeAssociation, setAssociationCardVisible, reorderAssociationCards, setAssociationCardFields,
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
  const [results, setResults] = useState<{ id: string; name: string; url: string; sub?: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null)
  const [customizing, setCustomizing] = useState(false)
  const [picked, setPicked] = useState<string[]>(card.selectedFields ?? [])

  // Native cards link via the FK/join mutation; Data-Model cards via objectAssociation.
  const searchType = card.native ? (card.addType ?? card.type) : card.type
  const canRemove = card.native ? !!card.removable : true
  const singular = card.label.replace(/s$/, "").toLowerCase()

  function openAdd() { setAdding(true); setQ(""); setResults([]); setError(null) }
  function closeAdd() { setAdding(false); setQ(""); setResults([]) }

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
      closeAdd(); router.refresh()
    })
  }

  function remove(id: string) {
    setError(null)
    startTransition(async () => {
      const res = card.native
        ? await setNativeAssociation(recordType, recordId, card.type, id, "remove")
        : await unassociateRecords(recordType, recordId, card.type, id)
      if ((res as any)?.error) { setConfirm(null); setError((res as any).error); return }
      setConfirm(null); router.refresh()
    })
  }

  function toggleField(key: string) {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }
  function saveFields() {
    startTransition(async () => {
      await setAssociationCardFields(recordType, card.type, picked)
      setCustomizing(false); router.refresh()
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
        {canEdit && (card.availableFields?.length ?? 0) > 0 && (
          <button onClick={() => { setPicked(card.selectedFields ?? []); setCustomizing(true) }} title="Choose fields to show"
            className="text-slate-300 hover:text-slate-600 shrink-0">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 max-h-72 overflow-y-auto">
        {card.records.length === 0 ? (
          <p className="text-sm text-slate-400">No {card.label.toLowerCase()} linked.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {card.records.map((r) => (
              <div key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <Link href={r.url} className="text-sm font-medium text-blue-600 hover:underline truncate">{r.name}</Link>
                  {canEdit && canRemove && (
                    <button onClick={() => { setError(null); setConfirm({ id: r.id, name: r.name }) }} disabled={isPending} title="Remove association"
                      className="h-6 w-6 shrink-0 inline-flex items-center justify-center text-slate-300 hover:text-red-500 rounded">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {(r.fields?.length ?? 0) > 0 && (
                  <dl className="mt-1.5 space-y-1">
                    {r.fields!.map((f) => (
                      <div key={f.key}>
                        <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{f.label}</dt>
                        <dd className="text-sm text-slate-700 break-words">{f.value ?? "—"}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <div className="flex justify-end">
            <button onClick={openAdd}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add association
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600 text-right">{error}</p>}
        </div>
      )}

      {/* Add-association modal */}
      <Dialog open={adding} onOpenChange={(o) => !o && closeAdd()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add {singular}</DialogTitle></DialogHeader>
          <div className="space-y-2 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={q} onChange={(e) => search(e.target.value)} placeholder={`Search ${card.label.toLowerCase()}…`} autoFocus
                className="w-full h-10 pl-9 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-1 px-1">
              {isPending && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>}
              {results.map((r) => (
                <button key={r.id} onClick={() => add(r.id)} disabled={isPending}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50">
                  <p className="text-sm text-slate-700 truncate">{r.name}</p>
                  {r.sub && <p className="text-xs text-slate-400 truncate">{r.sub}</p>}
                </button>
              ))}
              {q.trim().length >= 2 && !isPending && results.length === 0 && (
                <p className="px-3 py-3 text-sm text-slate-400 text-center">No matches.</p>
              )}
              {q.trim().length < 2 && !isPending && (
                <p className="px-3 py-3 text-sm text-slate-400 text-center">Type at least 2 characters to search.</p>
              )}
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Choose which fields of the associated record to show */}
      <Dialog open={customizing} onOpenChange={(o) => !o && setCustomizing(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{card.label} card fields</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 -mt-1">Pick which fields show under each {singular.toLowerCase()}&apos;s name.</p>
          <div className="max-h-72 overflow-y-auto -mx-1 px-1 py-1 space-y-0.5">
            {(card.availableFields ?? []).map((f) => (
              <button key={f.key} type="button" onClick={() => toggleField(f.key)}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 text-sm text-left rounded-md hover:bg-slate-50">
                <span className={cn("shrink-0 w-[15px] h-[15px] rounded border flex items-center justify-center", picked.includes(f.key) ? "bg-blue-600 border-blue-600" : "border-slate-300")}>
                  {picked.includes(f.key) && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className="text-slate-700">{f.label}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomizing(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={saveFields} disabled={isPending}>{isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove-association confirmation */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Remove association?</DialogTitle></DialogHeader>
          <div className="flex items-start gap-3 py-1">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </span>
            <p className="text-sm text-slate-600">
              Are you sure you want to remove the association with <span className="font-medium text-slate-900">{confirm?.name}</span>?
              This unlinks the two records — it doesn&apos;t delete either one.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={isPending}>Cancel</Button>
            <Button onClick={() => confirm && remove(confirm.id)} disabled={isPending} className="bg-red-600 hover:bg-red-700">
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
