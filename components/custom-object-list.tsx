"use client"

import { useState, useTransition, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Trash2, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import BulkActionBar, { bulkDanger } from "@/components/ui/bulk-action-bar"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import { bulkDeleteCustomObjectRecords } from "@/app/actions/custom-object-records"
import { useCardReorder } from "@/components/use-card-reorder"
import { readAssocValue } from "@/lib/association-columns"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import { cn } from "@/lib/utils"
import { recordName } from "@/lib/record-name"
import { EditableCell } from "@/components/ui/editable-cell"
import { cpToFieldDef } from "@/lib/cp-field-def"
import { updateRecordField } from "@/app/actions/record-fields"
import { setRecordOwner } from "@/app/actions/record-owner"
import { fmtDate, displayValue, displayCell } from "@/components/object-display"
import type { ObjectColumnCatalog, ObjectProperty } from "@/lib/object-columns"

// The TABLE body of a custom object's list. The chrome around it (views, search,
// filters, columns chooser, export, add) lives in ObjectViewShell, which owns the
// view config and hands this the rows to render.

export interface RecordRow {
  id: string
  recordNumber: number | null
  values: Record<string, any>
  ownerId: string | null
  ownerName: string | null
  createdByName: string | null
  createdAt: string | Date
  updatedAt: string | Date
  __assoc?: Record<string, any> // associated records attached server-side
}

interface Props {
  objectKey: string
  singular: string
  ownerLabel: string
  properties: ObjectProperty[]
  catalog: ObjectColumnCatalog
  rows: RecordRow[]
  /** Unfiltered count, so "no matches" reads differently from "nothing here yet". */
  totalRecords: number
  users: { id: string; label: string }[]
  userMap: Record<string, string>
  canEdit: boolean
  canDelete: boolean
  columns: string[]
  frozenCount: number
  onColumnsChange: (cols: string[]) => void
  sort: { key: string; dir: "asc" | "desc" }
  onSortChange: (next: { key: string; dir: "asc" | "desc" }) => void
  serverMode?: boolean
  serverTotal?: number
  serverPage?: number
  serverPageSize?: number
  onServerPage?: (page: number) => void
}

export default function CustomObjectList({
  objectKey, singular, ownerLabel, properties, catalog, rows, totalRecords, users, userMap,
  canEdit, canDelete, columns, frozenCount, onColumnsChange, sort, onSortChange,
  serverMode = false, serverTotal = 0, serverPage = 1, serverPageSize = 50, onServerPage,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { primary, otherProps, allCols, assocByKey } = catalog

  // Columns render in the user's chosen order (not catalog order).
  const cols = columns.map((k) => allCols.find((c) => c.key === k)).filter(Boolean) as { key: string; label: string }[]

  const { colWidth, startResize } = useColumnResize(`co_${objectKey}_colWidths`)
  // Drag column headers to reorder; the order (and frozen count) persist per user.
  const colReorder = useCardReorder(cols, (c) => c.key, (ids) => onColumnsChange(ids))
  // Frozen (sticky) columns: leading fixed __id/__name + the first data columns,
  // offset past the 40px row-select checkbox. widthOf mirrors the <colgroup>.
  const widthOf = (k: string) => k === "__id" ? (colWidth("__id") ?? 96) : k === "__name" ? (colWidth("__name") ?? 240) : (colWidth(k) ?? 180)
  const fmap = frozenMap(colReorder.order.map((c) => c.key), frozenCount, widthOf, 40)
  const cbFrozen = frozenCount > 0 // freeze the checkbox column whenever anything is frozen

  // Text columns start A→Z; id/date columns start newest/highest first.
  function toggleSort(k: string) {
    const firstDir: "asc" | "desc" = k === "__id" || k === "__created" ? "desc" : "asc"
    onSortChange({ key: k, dir: sort.key === k ? (sort.dir === "asc" ? "desc" : "asc") : firstDir })
  }
  const SortIcon = ({ k }: { k: string }) => sort.key === k ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null

  // Client-side pagination (25 / 50 / 100 per page). Server mode paginates via the URL.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const clientPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageC = Math.min(page, clientPages)
  const paged = serverMode ? rows : rows.slice((pageC - 1) * pageSize, (pageC - 1) * pageSize + pageSize)
  useEffect(() => { setPage(1) }, [rows.length, sort.key, sort.dir, pageSize]) // reset on result/size change
  const totalPages = serverMode ? Math.max(1, Math.ceil(serverTotal / serverPageSize)) : 1

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id))
  function toggleRow(id: string) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function bulkDelete() {
    if (!(await confirmDialog(`Delete ${selected.size} record${selected.size !== 1 ? "s" : ""}?`))) return
    startTransition(async () => { await bulkDeleteCustomObjectRecords(objectKey, Array.from(selected)); setSelected(new Set()); router.refresh() })
  }

  return (
    <div className="space-y-4">
      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        {canDelete && (
          <button onClick={bulkDelete} disabled={isPending} className={bulkDanger}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        )}
      </BulkActionBar>

      {rows.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center text-slate-400">
          {totalRecords === 0 ? `No ${singular.toLowerCase()} records yet.` : "No records match your search or filters."}
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                {colReorder.order.map((c) => <col key={c.key} style={{ width: widthOf(c.key) }} />)}
              </colgroup>
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th style={cbFrozen ? { position: "sticky", left: 0, zIndex: 30 } : undefined} className={cn("px-3 py-2 w-10", cbFrozen && "bg-slate-50")}>
                    <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} className="rounded border-slate-300 cursor-pointer" />
                  </th>
                  {colReorder.order.map((c) => (
                    <th key={c.key}
                      {...colReorder.handleProps(c.key)}
                      {...colReorder.cardProps(c.key)}
                      style={frozenHeadStyle(fmap.get(c.key))}
                      className={cn("px-3 py-2 font-semibold relative overflow-hidden cursor-grab active:cursor-grabbing transition-colors", colReorder.dragging === c.key ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(fmap.get(c.key), "bg-slate-50")))}>
                      <button onClick={() => toggleSort(c.key)} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800"><span className="flex-1 min-w-0 truncate text-left">{c.label}</span><SortIcon k={c.key} /></button>
                      <ColResizer onMouseDown={(e) => startResize(c.key, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((r) => (
                  <tr key={r.id} className={cn("transition-colors", selected.has(r.id) ? "bg-blue-50" : "hover:bg-slate-50")}>
                    <td style={cbFrozen ? { position: "sticky", left: 0, zIndex: 10 } : undefined} className={cn("px-3 py-2.5", cbFrozen && "bg-white")}><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} className="rounded border-slate-300 cursor-pointer" /></td>
                    {colReorder.order.map((c) => {
                      const prop = otherProps.find((p) => p.id === c.key)
                      const usesCell = c.key === "__owner" || !!prop
                      return (
                      <td key={c.key} style={{ maxWidth: widthOf(c.key), ...frozenCellStyle(fmap.get(c.key)) }}
                        className={cn(usesCell ? "p-0 align-middle" : "px-3 py-2.5 truncate", c.key === "__id" ? "text-slate-400 font-mono text-xs" : "text-slate-600", frozenClass(fmap.get(c.key)))}>
                        {c.key === "__id" ? (r.recordNumber != null ? `#${r.recordNumber}` : "—")
                          : c.key === "__name" ? (
                            <Link href={`/objects/${objectKey}/${r.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                              {recordName(properties, r.values, "") || (primary && displayValue(primary, r.values[primary.id], userMap)) || "Untitled"}
                            </Link>
                          )
                          : c.key === "__owner" ? (
                            <EditableCell def={{ key: "__owner", label: ownerLabel, type: "user" }} value={r.ownerId}
                              canEdit={canEdit} userMap={userMap} users={users}
                              onSave={(uid) => setRecordOwner(`CO:${objectKey}`, r.id, (uid as string) || null)}
                              onSaveOwner={(uid) => setRecordOwner(`CO:${objectKey}`, r.id, uid)} />
                          )
                          : c.key === "__created" ? fmtDate(r.createdAt)
                          : assocByKey[c.key] ? (readAssocValue(r as any, assocByKey[c.key]) || <span className="text-slate-300">—</span>)
                          : prop ? (
                            <EditableCell def={cpToFieldDef(prop as any, prop.id)} value={r.values[c.key]} values={r.values}
                              canEdit={canEdit} userMap={userMap}
                              onSave={(v) => updateRecordField(`CO:${objectKey}`, r.id, c.key, v)} />
                          )
                          : displayCell(prop, r.values[c.key], userMap)}
                      </td>
                    )})}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Client-side pagination (25 / 50 / 100 per page) */}
      {!serverMode && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>Showing {(pageC - 1) * pageSize + 1}–{Math.min(rows.length, (pageC - 1) * pageSize + pageSize)} of {rows.length}</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">Per page
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 px-2 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:outline-none">
                <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button disabled={pageC <= 1} onClick={() => setPage(pageC - 1)}
                className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Prev</button>
              <span className="px-2 tabular-nums">Page {pageC} of {clientPages}</span>
              <button disabled={pageC >= clientPages} onClick={() => setPage(pageC + 1)}
                className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* Server-side pagination */}
      {serverMode && serverTotal > serverPageSize && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Showing {(serverPage - 1) * serverPageSize + 1}–{Math.min(serverTotal, serverPage * serverPageSize)} of {serverTotal}</span>
          <div className="flex items-center gap-1">
            <button disabled={serverPage <= 1} onClick={() => onServerPage?.(serverPage - 1)}
              className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Prev</button>
            <span className="px-2 tabular-nums">Page {serverPage} of {totalPages}</span>
            <button disabled={serverPage >= totalPages} onClick={() => onServerPage?.(serverPage + 1)}
              className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white hover:border-slate-400 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
