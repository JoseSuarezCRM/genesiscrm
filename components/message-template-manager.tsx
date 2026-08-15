"use client"

import { useState, useTransition, useRef, useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Loader2, X, Pencil, Trash2, MessageSquare, Mail,
  Table2, LayoutList, Columns3, Download, ChevronUp, ChevronDown, LayoutTemplate,
} from "lucide-react"
import BulkActionBar, { bulkDanger } from "@/components/ui/bulk-action-bar"
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { useColumnResize, ColResizer } from "@/components/ui/use-column-resize"
import ColumnChooserModal from "@/components/ui/column-chooser"
import { useCardReorder } from "@/components/use-card-reorder"
import { frozenMap, frozenHeadStyle, frozenCellStyle, frozenClass } from "@/lib/frozen-columns"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/rich-text-editor"
import TokenTextarea from "@/components/ui/token-textarea"
import { MESSAGE_TOKEN_GROUPS } from "@/lib/message-tokens"
import ExportDialog from "@/components/ui/export-dialog"
import {
  createMessageTemplate, updateMessageTemplate, deleteMessageTemplate, toggleMessageTemplate, recordTemplateView,
} from "@/app/actions/message-templates"
import { cn } from "@/lib/utils"

interface Template {
  id: string
  name: string
  channel: "SMS" | "EMAIL"
  subject: string | null
  body: string
  blocks?: unknown
  isActive: boolean
  createdAt: string | Date
  updatedAt: string | Date
  lastViewedAt: string | Date | null
  createdByName: string | null
  updatedByName: string | null
  lastViewedByName: string | null
}

const TEMPLATE_COLUMNS: { key: string; label: string; sortable?: boolean }[] = [
  { key: "name",         label: "Name",          sortable: true },
  { key: "status",       label: "Status" },
  { key: "preview",      label: "Preview" },
  { key: "createdBy",    label: "Created by" },
  { key: "created",      label: "Created",       sortable: true },
  { key: "updatedBy",    label: "Last updated by" },
  { key: "updated",      label: "Last updated",  sortable: true },
  { key: "viewedBy",     label: "Last viewed by" },
  { key: "viewed",       label: "Last viewed" },
]
const DEFAULT_TEMPLATE_COLS = ["name", "status", "createdBy", "created", "updatedBy", "updated", "viewedBy"]
const TEMPLATE_COL_W: Record<string, number> = { name: 240, status: 120, preview: 260, createdBy: 160, created: 140, updatedBy: 160, updated: 140, viewedBy: 160, viewed: 140 }

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
}

// Grouped personalization fields. Keys must match what the automation engine's
// resolveTemplate substitutes.
const TOKEN_GROUPS = MESSAGE_TOKEN_GROUPS

const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
const inputCls = "w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-slate-400"

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

export default function MessageTemplateManager({ channel, templates, canManage = true, canDelete = true }: { channel: "SMS" | "EMAIL"; templates: Template[]; canManage?: boolean; canDelete?: boolean }) {
  const router = useRouter()
  const isEmail = channel === "EMAIL"
  const Icon = isEmail ? Mail : MessageSquare
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [form, setForm] = useState({ name: "", subject: "", body: "" })

  // Standard table state (view toggle, columns, sort, selection, export).
  const [viewMode, setViewMode] = useState<"cards" | "table">("table")
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_TEMPLATE_COLS)
  const [frozenCount, setFrozenCount] = useState(0)
  const [colModalOpen, setColModalOpen] = useState(false)
  const { colWidth, startResize } = useColumnResize(`templateColWidths_${channel}`)
  const [sortKey, setSortKey] = useState<"name" | "created" | "updated">("created") // newest first
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    try {
      const v = localStorage.getItem("templateViewMode"); if (v === "cards" || v === "table") setViewMode(v)
      const c = localStorage.getItem("templateCols"); if (c) { const a = JSON.parse(c); if (Array.isArray(a) && a.length) setVisibleCols(a) }
      const f = localStorage.getItem("templateFrozen"); if (f != null) { const n = Number(f); if (!Number.isNaN(n)) setFrozenCount(n) }
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem("templateViewMode", viewMode) } catch {} }, [viewMode])
  useEffect(() => { try { localStorage.setItem("templateCols", JSON.stringify(visibleCols)) } catch {} }, [visibleCols])
  useEffect(() => { try { localStorage.setItem("templateFrozen", String(frozenCount)) } catch {} }, [frozenCount])

  const hasBlocks = (t: Template) => Array.isArray((t as any).blocks) && (t as any).blocks.length > 0
  function openNew() { setEditId(null); setForm({ name: "", subject: "", body: "" }); setError(""); setOpen(true) }
  function openEdit(t: Template) {
    recordTemplateView(t.id)
    // Block-built email templates open in the full-page block builder.
    if (isEmail && hasBlocks(t)) { router.push(`/communications/email/${t.id}`); return }
    setEditId(t.id); setForm({ name: t.name, subject: t.subject ?? "", body: t.body }); setError(""); setOpen(true)
  }
  function close() { setOpen(false); setEditId(null); setError("") }

  // Create a blank block template and jump into the builder.
  function newWithBlocks() {
    startTransition(async () => {
      const r = await createMessageTemplate({ name: "Untitled email", channel: "EMAIL", subject: "", body: "", blocks: [] })
      if ((r as any).id) router.push(`/communications/email/${(r as any).id}`)
    })
  }
  // Convert the template currently open in the rich-text modal to blocks.
  function buildWithBlocks() {
    if (!form.name.trim()) { setError("Template name is required"); return }
    startTransition(async () => {
      let id = editId
      if (!id) {
        const r = await createMessageTemplate({ name: form.name, channel, subject: form.subject, body: form.body })
        if ((r as any)?.error) { setError((r as any).error); return }
        id = (r as any).id
      } else {
        await updateMessageTemplate(id, { name: form.name, subject: form.subject, body: form.body })
      }
      router.push(`/communications/email/${id}`)
    })
  }

  function save() {
    if (!form.name.trim()) { setError("Template name is required"); return }
    startTransition(async () => {
      const res = editId
        ? await updateMessageTemplate(editId, { name: form.name, subject: form.subject, body: form.body })
        : await createMessageTemplate({ name: form.name, channel, subject: form.subject, body: form.body })
      if ((res as any)?.error) { setError((res as any).error); return }
      close(); router.refresh()
    })
  }
  async function remove(id: string) {
    if (!(await confirmDialog("Delete this template? This cannot be undone."))) return
    startTransition(async () => { await deleteMessageTemplate(id); router.refresh() })
  }
  function toggle(t: Template) {
    startTransition(async () => { await toggleMessageTemplate(t.id, !t.isActive); router.refresh() })
  }

  // Render in the user's chosen order, with the required "name" column first.
  const orderedKeys = ["name", ...visibleCols.filter((k) => k !== "name")]
  const cols = (orderedKeys.map((k) => TEMPLATE_COLUMNS.find((c) => c.key === k)).filter(Boolean) as typeof TEMPLATE_COLUMNS)
  const reorderableCols = cols.filter((c) => c.key !== "name")
  const colReorder = useCardReorder(reorderableCols, (c) => c.key, (ids) => setVisibleCols(["name", ...ids]))
  const orderedCols = [cols.find((c) => c.key === "name")!, ...colReorder.order].filter(Boolean) as typeof cols
  const widthOf = (k: string) => colWidth(k) ?? TEMPLATE_COL_W[k] ?? 160
  const fmap = frozenMap(orderedCols.map((c) => c.key), frozenCount, widthOf, 40)
  const cbFrozen = frozenCount > 0
  const toggleSort = (key: "name" | "created" | "updated") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("desc") }
  }
  const sorted = [...templates].sort((a, b) => {
    let cmp = 0
    if (sortKey === "name") cmp = a.name.localeCompare(b.name)
    else if (sortKey === "created") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    return sortDir === "asc" ? cmp : -cmp
  })

  const toggleRow = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allChecked = sorted.length > 0 && sorted.every((t) => selected.has(t.id))
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(sorted.map((t) => t.id)))
  async function bulkDelete() {
    if (!(await confirmDialog(`Delete ${selected.size} template${selected.size !== 1 ? "s" : ""}? This cannot be undone.`))) return
    startTransition(async () => { for (const id of Array.from(selected)) await deleteMessageTemplate(id); setSelected(new Set()); router.refresh() })
  }

  function buildExportData() {
    const headers = ["Name", "Status", isEmail ? "Subject" : "Message", "Created by", "Created", "Last updated by", "Last updated", "Last viewed by", "Last viewed"]
    const rows = sorted.map((t) => [
      t.name, t.isActive ? "On" : "Off", isEmail ? (t.subject ?? "") : stripHtml(t.body),
      t.createdByName ?? "", fmtDate(t.createdAt), t.updatedByName ?? "", fmtDate(t.updatedAt),
      t.lastViewedByName ?? "", fmtDate(t.lastViewedAt),
    ])
    return { headers, rows }
  }

  function renderCell(t: Template, key: string): ReactNode {
    switch (key) {
      case "name":
        return (
          <span className="inline-flex items-center gap-1.5">
            <button onClick={() => openEdit(t)} className="font-medium text-slate-900 hover:text-blue-600 text-left">{t.name}</button>
            {isEmail && hasBlocks(t) && <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Blocks</span>}
          </span>
        )
      case "status":
        return (
          <button onClick={() => toggle(t)} disabled={pending || !canManage} className="flex items-center gap-1.5 text-[11px] font-medium">
            <span className={cn("w-2 h-2 rounded-full", t.isActive ? "bg-emerald-500" : "bg-slate-300")} />
            <span className={t.isActive ? "text-emerald-700" : "text-slate-400"}>{t.isActive ? "On" : "Off"}</span>
          </button>
        )
      case "preview": return <span className="text-slate-500 line-clamp-1">{(isEmail ? t.subject : stripHtml(t.body)) || "—"}</span>
      case "createdBy": return <span className="text-slate-600">{t.createdByName ?? "—"}</span>
      case "created": return <span className="text-slate-600">{fmtDate(t.createdAt)}</span>
      case "updatedBy": return <span className="text-slate-600">{t.updatedByName ?? "—"}</span>
      case "updated": return <span className="text-slate-600">{fmtDate(t.updatedAt)}</span>
      case "viewedBy": return <span className="text-slate-600">{t.lastViewedByName ?? "—"}</span>
      case "viewed": return <span className="text-slate-600">{fmtDate(t.lastViewedAt)}</span>
      default: return null
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isEmail ? "Email Templates" : "SMS Templates"}</h1>
          <p className="text-sm text-slate-500">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
            <button onClick={() => setViewMode("table")} title="Table view"
              className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${viewMode === "table" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-800"}`}><Table2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => setViewMode("cards")} title="Card view"
              className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${viewMode === "cards" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-zinc-800"}`}><LayoutList className="h-3.5 w-3.5" /></button>
          </div>
          {viewMode === "table" && (
            <button onClick={() => setColModalOpen(true)} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 transition-colors">
              <Columns3 className="h-3.5 w-3.5" /> Columns <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
          )}
          <button onClick={() => setExportOpen(true)} disabled={templates.length === 0} title="Export to CSV"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-600 hover:border-zinc-400 disabled:opacity-50 transition-colors"><Download className="h-3.5 w-3.5" /> Export</button>
          {canManage && isEmail && <Button variant="outline" onClick={newWithBlocks}><LayoutTemplate className="h-4 w-4 mr-2" /> New with blocks</Button>}
          {canManage && <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New template</Button>}
        </div>
      </div>

      {canDelete && (
        <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button onClick={bulkDelete} disabled={pending} className={bulkDanger}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </BulkActionBar>
      )}

      {templates.length === 0 ? (
        <div className="bg-white border rounded-xl py-16 text-center space-y-3">
          <Icon className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="text-slate-500 font-medium">No {isEmail ? "email" : "SMS"} templates yet</p>
          <p className="text-slate-400 text-sm">Create reusable {isEmail ? "email" : "text"} templates to send and reference across the app.</p>
          {canManage && <div className="pt-2"><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New template</Button></div>}
        </div>
      ) : viewMode === "table" ? (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: 40 }} />
                {orderedCols.map((col) => <col key={col.key} style={{ width: widthOf(col.key) }} />)}
                <col style={{ width: 64 }} />
              </colgroup>
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th style={cbFrozen ? { position: "sticky", left: 0, zIndex: 30 } : undefined} className={cn("px-3 py-2 w-10", cbFrozen && "bg-slate-50")}><input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded border-slate-300 cursor-pointer" /></th>
                  {orderedCols.map((col) => {
                    const draggable = col.key !== "name"
                    return (
                      <th key={col.key}
                        {...(draggable ? { ...colReorder.handleProps(col.key), ...colReorder.cardProps(col.key) } : {})}
                        style={frozenHeadStyle(fmap.get(col.key))}
                        className={cn("text-left px-3 py-2 font-semibold relative overflow-hidden transition-colors", draggable && "cursor-grab active:cursor-grabbing", (draggable && colReorder.dragging === col.key) ? "bg-slate-200/70" : cn("hover:bg-slate-100", frozenClass(fmap.get(col.key), "bg-slate-50")))}>
                        {col.sortable ? (
                          <button onClick={() => toggleSort(col.key as "name" | "created" | "updated")} className="flex items-center gap-1 w-full min-w-0 hover:text-slate-800">
                            <span className="flex-1 min-w-0 truncate text-left">{col.label}</span>{sortKey === col.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />)}
                          </button>
                        ) : <span className="block truncate">{col.label}</span>}
                        <ColResizer onMouseDown={(e) => startResize(col.key, e)} />
                      </th>
                    )
                  })}
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.id} className={`border-b transition-colors ${selected.has(t.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <td style={cbFrozen ? { position: "sticky", left: 0, zIndex: 10 } : undefined} className={cn("px-3 py-2.5", cbFrozen && "bg-white")}><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleRow(t.id)} className="rounded border-slate-300 cursor-pointer" /></td>
                    {orderedCols.map((col) => <td key={col.key} className={cn("px-3 py-2.5 truncate", frozenClass(fmap.get(col.key)))} style={{ maxWidth: widthOf(col.key), ...frozenCellStyle(fmap.get(col.key)) }}>{renderCell(t, col.key)}</td>)}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex gap-0.5">
                        {canManage && <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>}
                        {canDelete && <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map((t) => (
            <div key={t.id} className="group bg-white border border-slate-200 rounded-xl p-4 space-y-2 hover:border-slate-300 transition-colors flex flex-col">
              <div className="flex items-start gap-2">
                <span className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", isEmail ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                  {isEmail && <p className="text-xs text-slate-400 truncate">{t.subject || "No subject"}</p>}
                </div>
                <button onClick={() => toggle(t)} disabled={pending || !canManage} title={t.isActive ? "Active" : "Inactive"}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-medium">
                  <span className={cn("w-2 h-2 rounded-full", t.isActive ? "bg-emerald-500" : "bg-slate-300")} />
                  <span className={t.isActive ? "text-emerald-700" : "text-slate-400"}>{t.isActive ? "On" : "Off"}</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 line-clamp-3 flex-1">{stripHtml(t.body) || "—"}</p>
              <p className="text-[11px] text-slate-400">By {t.createdByName ?? "—"} · {fmtDate(t.createdAt)}</p>
              <div className="flex items-center justify-end gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {canManage && <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>}
                {canDelete && <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} subject={isEmail ? "email templates" : "SMS templates"}
        defaultName={`${isEmail ? "email" : "sms"}-templates-${new Date().toISOString().slice(0, 10)}`} getData={buildExportData} />

      <ColumnChooserModal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        columns={TEMPLATE_COLUMNS}
        required={["name"]}
        selected={visibleCols}
        frozen={frozenCount}
        onApply={(sel, fr) => { setVisibleCols(sel); setFrozenCount(fr) }}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh] animate-modal-in">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="text-base font-semibold text-slate-900">{editId ? "Edit template" : `New ${isEmail ? "email" : "SMS"} template`}</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <label className={labelCls}>Template Name *</label>
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Post-op follow-up" />
              </div>
              {isEmail && (
                <div>
                  <label className={labelCls}>Subject</label>
                  <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} placeholder="Email subject line" />
                </div>
              )}
              <div>
                <label className={labelCls}>{isEmail ? "Body" : "Message"}</label>
                {isEmail ? (
                  <RichTextEditor value={form.body} onChange={(html) => setForm({ ...form, body: html })} tokenGroups={TOKEN_GROUPS} minHeight={200} />
                ) : (
                  <>
                    <TokenTextarea value={form.body} onChange={(v) => setForm({ ...form, body: v })} rows={5}
                      tokenGroups={TOKEN_GROUPS} placeholder="Type your text message…" />
                    <p className="text-xs text-slate-400 mt-1">{form.body.length} characters · {Math.max(1, Math.ceil(form.body.length / 160))} SMS segment{form.body.length > 160 ? "s" : ""}</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 px-6 py-4 border-t shrink-0">
              {isEmail && <Button variant="outline" onClick={buildWithBlocks} disabled={pending} title="Convert this template to the block builder"><LayoutTemplate className="h-4 w-4 mr-1.5" /> Build with blocks</Button>}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
                <Button onClick={save} disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}{editId ? "Save" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
